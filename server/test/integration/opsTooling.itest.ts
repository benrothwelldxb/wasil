import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Ops tooling against a REAL Postgres. Service-level logic (flags precedence,
// impersonation lifecycle) is exercised directly; the HTTP surface is exercised
// with the auth middleware stubbed to inject a chosen principal (the DB is not
// mocked — only "who is calling").

// Mutable principal the stubbed middleware injects.
let currentUser: { id: string; name: string; email: string; role: string; schoolId: string } | null = null
vi.mock('../../src/middleware/auth', () => {
  const inject = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!currentUser) return res.status(401).json({ error: 'no user' })
    ;(req as express.Request & { user: unknown }).user = currentUser
    next()
  }
  return { isAdmin: inject, isAuthenticated: inject, isSuperAdmin: inject, isStaff: inject, loadUserWithRelations: vi.fn() }
})

const prisma = (await import('../../src/services/prisma')).default
const { default: opsRouter, clientOpsRouter } = await import('../../src/routes/ops')
const flags = await import('../../src/services/featureFlags')
const { startImpersonation, stopImpersonation } = await import('../../src/services/impersonation')
const { verifyAccessToken } = await import('../../src/services/jwt')

const TAG = 'itest-ops'

function adminApp() {
  const app = express(); app.use(express.json()); app.use('/api/ops', opsRouter); return app
}
function clientApp() {
  const app = express(); app.use(express.json()); app.use('/api', clientOpsRouter); return app
}

let schoolId = ''
let adminId = ''
let parentId = ''
let studentId = ''

beforeAll(async () => {
  const school = await prisma.school.create({ data: { name: `${TAG}-school`, shortName: `${TAG}`.slice(0, 10), city: 'Dubai' } })
  schoolId = school.id
  const admin = await prisma.user.create({ data: { email: `${TAG}-admin@example.com`, name: 'Admin', role: 'ADMIN', schoolId } })
  adminId = admin.id
  const parent = await prisma.user.create({ data: { email: `${TAG}-parent@example.com`, name: 'Parent One', role: 'PARENT', schoolId, welcomeSentAt: new Date(), lastLoginAt: new Date() } })
  parentId = parent.id
  const cls = await prisma.class.create({ data: { name: `${TAG}-class`, schoolId } })
  const student = await prisma.student.create({ data: { firstName: 'Zaydxyz', lastName: 'Ahmed', schoolId, classId: cls.id } })
  studentId = student.id
  await prisma.parentStudentLink.create({ data: { userId: parentId, studentId } })
})

afterAll(async () => {
  await prisma.authEvent.deleteMany({ where: { schoolId } })
  await prisma.impersonationSession.deleteMany({ where: { schoolId } })
  await prisma.feedback.deleteMany({ where: { schoolId } })
  await prisma.announcement.deleteMany({ where: { OR: [{ schoolId }, { title: { startsWith: TAG } }] } })
  await prisma.featureFlagOverride.deleteMany({ where: { OR: [{ schoolId }, { userId: parentId }] } })
  await prisma.parentStudentLink.deleteMany({ where: { userId: parentId } })
  await prisma.student.deleteMany({ where: { schoolId } })
  await prisma.class.deleteMany({ where: { schoolId } })
  await prisma.user.deleteMany({ where: { schoolId } })
  await prisma.school.deleteMany({ where: { id: schoolId } })
  await prisma.$disconnect()
})

beforeEach(() => {
  currentUser = { id: adminId, name: 'Admin', email: `${TAG}-admin@example.com`, role: 'ADMIN', schoolId }
})

describe('feature flags — precedence (real PG)', () => {
  it('resolves user > school > global > catalog default', async () => {
    await flags.setGlobalDefault('clubs', false)
    expect((await flags.resolveAll({ schoolId }))['clubs']).toBe(false)

    await flags.setOverride('clubs', { schoolId }, true)
    expect((await flags.resolveAll({ schoolId }))['clubs']).toBe(true) // school beats global

    await flags.setOverride('clubs', { userId: parentId }, false)
    expect((await flags.resolveAll({ schoolId, userId: parentId }))['clubs']).toBe(false) // user beats school
  })

  it('kill-switch: a global-off flag hides the surface for everyone', async () => {
    await flags.setGlobalDefault('payments', false)
    expect(await flags.isEnabled('payments', { schoolId })).toBe(false)
  })
})

describe('impersonation — lifecycle & guards (real PG)', () => {
  it('mints an actor-stamped token, records a session + audit, and stops', async () => {
    const result = await startImpersonation({
      adminId, adminSchoolId: schoolId, adminIsSuperAdmin: false, targetUserId: parentId, reason: 'support',
    })
    // Token authenticates AS the parent but carries the admin id in `act`.
    const payload = verifyAccessToken(result.token)
    expect(payload.userId).toBe(parentId)
    expect(payload.act).toBe(adminId)

    const session = await prisma.impersonationSession.findUnique({ where: { id: result.sessionId } })
    expect(session?.adminId).toBe(adminId)
    expect(session?.endedAt).toBeNull()

    const started = await prisma.authEvent.findFirst({ where: { event: 'impersonation_started', userId: parentId } })
    expect(started).toBeTruthy()

    const stop = await stopImpersonation({ adminId, sessionId: result.sessionId })
    expect(stop.ended).toBe(1)
    const after = await prisma.impersonationSession.findUnique({ where: { id: result.sessionId } })
    expect(after?.endedAt).not.toBeNull()
  })

  it('refuses to impersonate an admin (including oneself)', async () => {
    // Self here is an ADMIN, so the admin-role guard (403) fires — no admin,
    // super-admin, or self can ever be impersonated.
    await expect(startImpersonation({ adminId, adminSchoolId: schoolId, adminIsSuperAdmin: false, targetUserId: adminId }))
      .rejects.toMatchObject({ status: 403 })
    const admin2 = await prisma.user.create({ data: { email: `${TAG}-admin2@example.com`, name: 'A2', role: 'ADMIN', schoolId } })
    await expect(startImpersonation({ adminId, adminSchoolId: schoolId, adminIsSuperAdmin: false, targetUserId: admin2.id }))
      .rejects.toMatchObject({ status: 403 })
  })
})

describe('announcements — active window (real PG)', () => {
  it('client sees only active, in-window announcements for its school (or platform-wide)', async () => {
    await prisma.announcement.create({ data: { title: `${TAG}-live`, schoolId, active: true, startsAt: new Date(Date.now() - 1000) } })
    await prisma.announcement.create({ data: { title: `${TAG}-expired`, schoolId, active: true, startsAt: new Date(Date.now() - 10000), endsAt: new Date(Date.now() - 1000) } })
    await prisma.announcement.create({ data: { title: `${TAG}-inactive`, schoolId, active: false, startsAt: new Date(Date.now() - 1000) } })
    await prisma.announcement.create({ data: { title: `${TAG}-platform`, schoolId: null, active: true, startsAt: new Date(Date.now() - 1000) } })

    currentUser = { id: parentId, name: 'Parent One', email: `${TAG}-parent@example.com`, role: 'PARENT', schoolId }
    const res = await request(clientApp()).get('/api/announcements')
    expect(res.status).toBe(200)
    const titles = res.body.announcements.map((a: { title: string }) => a.title)
    expect(titles).toContain(`${TAG}-live`)
    expect(titles).toContain(`${TAG}-platform`)
    expect(titles).not.toContain(`${TAG}-expired`)
    expect(titles).not.toContain(`${TAG}-inactive`)
  })
})

describe('feedback capture (real PG)', () => {
  it('stores free-text plus client context', async () => {
    currentUser = { id: parentId, name: 'Parent One', email: `${TAG}-parent@example.com`, role: 'PARENT', schoolId }
    const res = await request(clientApp())
      .post('/api/feedback')
      .set('User-Agent', 'itest-agent')
      .send({ message: 'The RSVP button did nothing', screen: 'EventDetail', url: 'https://app/x', appVersion: '1.2.3' })
    expect(res.status).toBe(201)
    const fb = await prisma.feedback.findUnique({ where: { id: res.body.id } })
    expect(fb?.message).toContain('RSVP button')
    expect(fb?.screen).toBe('EventDetail')
    expect(fb?.userId).toBe(parentId)
  })
})

describe('support search + metrics (real PG)', () => {
  it('finds a parent by child name and returns activation detail without SQL', async () => {
    const search = await request(adminApp()).get('/api/ops/support/search').query({ q: 'Zaydxyz' })
    expect(search.status).toBe(200)
    const ids = search.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(parentId)

    const detail = await request(adminApp()).get(`/api/ops/support/parent/${parentId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.parent.activated).toBe(true)
    expect(detail.body.parent.invited).toBe(true)
    expect(detail.body.parent.children[0].name).toContain('Zaydxyz')
  })

  it('returns a metrics snapshot scoped to the admin school', async () => {
    const res = await request(adminApp()).get('/api/ops/metrics')
    expect(res.status).toBe(200)
    expect(res.body.scope.schoolId).toBe(schoolId)
    expect(res.body.parents.total).toBeGreaterThanOrEqual(1)
    expect(res.body.parents.activated).toBeGreaterThanOrEqual(1)
    expect(res.body).toHaveProperty('queue')
    expect(res.body).toHaveProperty('notifications')
    expect(res.body).toHaveProperty('health')
  })
})
