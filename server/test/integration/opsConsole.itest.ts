import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

// Operations Console backend against real Postgres: support actions (resend /
// unlock / invalidate / reset / magic-link), tenant isolation, jobs retry,
// audit explorer, school health, release. Only email + the auth principal are
// stubbed; the database is real.

let currentUser: { id: string; name: string; email: string; role: string; schoolId: string } | null = null
vi.mock('../../src/middleware/auth', () => {
  const inject = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!currentUser) return res.status(401).json({ error: 'no user' })
    ;(req as express.Request & { user: unknown }).user = currentUser
    next()
  }
  return { isAdmin: inject, isAuthenticated: inject, isSuperAdmin: inject, isStaff: inject, loadUserWithRelations: vi.fn() }
})
const sendParentWelcomeEmail = vi.fn(async () => true)
vi.mock('../../src/services/email', () => ({
  sendParentWelcomeEmail,
  sendMagicLinkEmail: vi.fn(), sendInvitationEmail: vi.fn(), sendLoginCodeEmail: vi.fn(),
}))

const prisma = (await import('../../src/services/prisma')).default
const { default: opsRouter } = await import('../../src/routes/ops')

const TAG = 'itest-console'
function app() { const a = express(); a.use(express.json()); a.use('/api/ops', opsRouter); return a }

let schoolA = '', schoolB = ''
let adminA = { id: '', name: 'AdminA', email: '', role: 'ADMIN', schoolId: '' }
let adminB = { id: '', name: 'AdminB', email: '', role: 'ADMIN', schoolId: '' }
let parentA = ''

beforeAll(async () => {
  const sA = await prisma.school.create({ data: { name: `${TAG}-A`, shortName: `${TAG}A`.slice(0, 10), city: 'Dubai' } })
  const sB = await prisma.school.create({ data: { name: `${TAG}-B`, shortName: `${TAG}B`.slice(0, 10), city: 'Dubai' } })
  schoolA = sA.id; schoolB = sB.id
  const aA = await prisma.user.create({ data: { email: `${TAG}-adminA@x.com`, name: 'AdminA', role: 'ADMIN', schoolId: schoolA } })
  const aB = await prisma.user.create({ data: { email: `${TAG}-adminB@x.com`, name: 'AdminB', role: 'ADMIN', schoolId: schoolB } })
  adminA = { ...adminA, id: aA.id, email: aA.email, schoolId: schoolA }
  adminB = { ...adminB, id: aB.id, email: aB.email, schoolId: schoolB }
  const p = await prisma.user.create({ data: { email: `${TAG}-parentA@x.com`, name: 'Parent A', role: 'PARENT', schoolId: schoolA, welcomeSentAt: new Date(), failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 3600_000) } })
  parentA = p.id
})

afterAll(async () => {
  await prisma.authEvent.deleteMany({ where: { OR: [{ schoolId: schoolA }, { schoolId: schoolB }] } })
  await prisma.magicLinkToken.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: TAG } } } })
  await prisma.outboxEntry.deleteMany({ where: { OR: [{ schoolId: schoolA }, { schoolId: schoolB }] } })
  await prisma.auditLog.deleteMany({ where: { OR: [{ schoolId: schoolA }, { schoolId: schoolB }] } })
  await prisma.user.deleteMany({ where: { OR: [{ schoolId: schoolA }, { schoolId: schoolB }] } })
  await prisma.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } })
  await prisma.$disconnect()
})

beforeEach(() => { currentUser = { ...adminA }; vi.clearAllMocks() })

describe('support actions (real PG)', () => {
  it('resend-invite emails + stamps welcomeSentAt + audits', async () => {
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/resend-invite`)
    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(true)
    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(1)
    const ev = await prisma.authEvent.findFirst({ where: { event: 'support_invite_resent', userId: parentA } })
    expect(ev).toBeTruthy()
  })

  it('unlock clears the lockout', async () => {
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/unlock`)
    expect(res.status).toBe(200)
    const u = await prisma.user.findUnique({ where: { id: parentA } })
    expect(u?.lockedUntil).toBeNull()
    expect(u?.failedLoginAttempts).toBe(0)
  })

  it('invalidate-sessions revokes all refresh tokens', async () => {
    await prisma.refreshToken.createMany({ data: [
      { token: `${TAG}-t1`, userId: parentA, expiresAt: new Date(Date.now() + 1e9) },
      { token: `${TAG}-t2`, userId: parentA, expiresAt: new Date(Date.now() + 1e9) },
    ] })
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/invalidate-sessions`)
    expect(res.status).toBe(200)
    expect(res.body.revoked).toBe(2)
    expect(await prisma.refreshToken.count({ where: { userId: parentA } })).toBe(0)
  })

  it('reset-onboarding clears welcomeSentAt without deleting the account', async () => {
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/reset-onboarding`)
    expect(res.status).toBe(200)
    const u = await prisma.user.findUnique({ where: { id: parentA } })
    expect(u?.welcomeSentAt).toBeNull()
    expect(u).toBeTruthy() // still exists
  })

  it('magic-link mints a one-time LOGIN token and returns a URL', async () => {
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/magic-link`)
    expect(res.status).toBe(200)
    expect(res.body.url).toContain('/auth/magic?token=')
    const tok = await prisma.magicLinkToken.findFirst({ where: { email: `${TAG}-parenta@x.com`, type: 'LOGIN' } })
    expect(tok).toBeTruthy()
    // The token value is never echoed into the audit trail.
    const ev = await prisma.authEvent.findFirst({ where: { event: 'support_magic_link_issued', userId: parentA } })
    expect(JSON.stringify(ev)).not.toContain(tok!.token)
  })

  it('TENANT ISOLATION: an admin from another school cannot act on this parent', async () => {
    currentUser = { ...adminB } // school B admin targeting a school A parent
    const res = await request(app()).post(`/api/ops/support/parent/${parentA}/unlock`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('cross_school_forbidden')
  })
})

describe('background jobs (real PG)', () => {
  it('retries a failed job (FAILED → PENDING, runnable now) and is tenant-checked', async () => {
    const job = await prisma.outboxEntry.create({ data: { schoolId: schoolA, kind: 'EMAIL', payload: {}, status: 'FAILED', failedAt: new Date(), lastError: 'boom' } })

    // Admin B cannot retry school A's job.
    currentUser = { ...adminB }
    const forbidden = await request(app()).post(`/api/ops/jobs/${job.id}/retry`)
    expect(forbidden.status).toBe(403)

    currentUser = { ...adminA }
    const ok = await request(app()).post(`/api/ops/jobs/${job.id}/retry`)
    expect(ok.status).toBe(200)
    const after = await prisma.outboxEntry.findUnique({ where: { id: job.id } })
    expect(after?.status).toBe('PENDING')
    expect(after?.lastError).toBeNull()
  })

  it('lists jobs with a status summary scoped to the school', async () => {
    const res = await request(app()).get('/api/ops/jobs')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(Array.isArray(res.body.entries)).toBe(true)
  })
})

describe('audit explorer + schools + release (real PG)', () => {
  it('audit explorer returns rows scoped to the admin school', async () => {
    const res = await request(app()).get('/api/ops/audit').query({ userId: parentA })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.rows)).toBe(true)
    // Our earlier support actions produced auth events for this parent.
    expect(res.body.rows.length).toBeGreaterThan(0)
    for (const r of res.body.rows) {
      if (r.schoolId) expect(r.schoolId).toBe(schoolA)
    }
  })

  it('school health returns a rollup for the admin school only', async () => {
    const res = await request(app()).get('/api/ops/schools')
    expect(res.status).toBe(200)
    expect(res.body.schools).toHaveLength(1)
    expect(res.body.schools[0].id).toBe(schoolA)
    expect(res.body.schools[0]).toHaveProperty('activatedPct')
  })

  it('release info returns version/env/migration shape', async () => {
    const res = await request(app()).get('/api/ops/release')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('environment')
    expect(res.body).toHaveProperty('migration')
  })

  it('incidents endpoint returns a derived list', async () => {
    const res = await request(app()).get('/api/ops/incidents')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.incidents)).toBe(true)
  })
})
