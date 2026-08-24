import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// Non-teaching staff (reception / office) on the partner inbox. Connect only
// holds a User row for staff it has already provisioned, so a reception user
// resolved to "unknown" and every partner inbox route 403'd — Desk rendered
// that as "no class list available".
//
// Per ADR 0004 the partner surface validates SCHOOL MEMBERSHIP, not job title:
// when the local lookup misses we ask Hub, and a Hub-confirmed staff member is
// authorised (and backed by a linked/provisioned Connect user). These tests pin
// that, plus the two invariants it must not break — no role rewrites, and an
// ILSA is never a staff actor.

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
  school: { findFirst: vi.fn(), findMany: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  student: { findMany: vi.fn(), findFirst: vi.fn() },
  class: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const hubMisMock = { listStaff: vi.fn() }
vi.mock('../src/services/hubMis', () => hubMisMock)

vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))

const { default: partnerRoutes } = await import('../src/routes/partner')
const { clearHubStaffCache } = await import('../src/services/hubStaffActor')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex')
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

// The real repro: a RECEPTION user with a Hub identity and no Connect row.
const RECEPTION_HUB_ID = 'oQ8ScnF1Fzyui42EGhN6qG157OZp9nVn'
const HUB_RECEPTION = {
  id: 'hub-staff-9',
  firstName: 'Amal',
  lastName: 'Qanda',
  email: 'Amal.Qanda@school.example',
  jobTitle: 'Receptionist',
  hubUserId: RECEPTION_HUB_ID,
  globalRoles: [],
  isInviteAccepted: true,
}
const SCHOOL = { id: 'sch-1', hubSchoolId: 'hub-sch-1' }

beforeEach(() => {
  vi.clearAllMocks()
  clearHubStaffCache()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  // No Connect user carries this Hub id (the confirmed production state).
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.school.findMany.mockResolvedValue([SCHOOL])
  prismaMock.school.findFirst.mockResolvedValue(SCHOOL)
  prismaMock.user.create.mockResolvedValue({ id: 'u-new', role: 'STAFF', schoolId: 'sch-1', name: 'Amal Qanda' })
  prismaMock.user.update.mockResolvedValue({})
  prismaMock.student.findMany.mockResolvedValue([])
  prismaMock.conversation.findMany.mockResolvedValue([])
  hubMisMock.listStaff.mockResolvedValue([HUB_RECEPTION])
})

describe('partner inbox — Hub-confirmed non-teaching staff', () => {
  it('authorises a reception user Connect has never provisioned, and backs her with a STAFF user', async () => {
    const res = await auth(
      request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`),
    )

    expect(res.status).toBe(200)
    expect(hubMisMock.listStaff).toHaveBeenCalledWith('hub-sch-1')
    // Provisioned once, with the Hub identity linked and the email lowercased.
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.create.mock.calls[0][0].data).toMatchObject({
      email: 'amal.qanda@school.example',
      name: 'Amal Qanda',
      role: 'STAFF',
      schoolId: 'sch-1',
      position: 'Receptionist',
      hubUserId: RECEPTION_HUB_ID,
    })
    // scope=school is honoured and still hard-scoped to her school.
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'sch-1', isTest: false })
  })

  it('maps Hub admin roles for a brand-new user (SCHOOL_ADMIN → ADMIN)', async () => {
    hubMisMock.listStaff.mockResolvedValue([{ ...HUB_RECEPTION, globalRoles: ['SCHOOL_ADMIN'] }])
    await auth(request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`))
    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe('ADMIN')
  })

  it('links a pre-existing same-email account instead of creating, and NEVER rewrites its role', async () => {
    // She already exists as a PARENT (a member of staff who is also a guardian);
    // the guardian sync created her first and deliberately left the role alone.
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null) // by hubUserId
      .mockResolvedValueOnce({ id: 'u-parent', role: 'PARENT', schoolId: 'sch-1', name: 'Amal Qanda', hubUserId: null })

    const res = await auth(
      request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`),
    )

    expect(res.status).toBe(200)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    const update = prismaMock.user.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'u-parent' })
    expect(update.data).toEqual({ hubUserId: RECEPTION_HUB_ID, position: 'Receptionist' })
    expect(update.data).not.toHaveProperty('role')
  })

  it('refuses to re-point an email match that already carries a different Hub identity', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u-other', role: 'STAFF', schoolId: 'sch-1', name: 'Someone Else', hubUserId: 'other-hub-id' })

    const res = await auth(
      request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`),
    )

    expect(res.status).toBe(403)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('authorises the same actor across the whole inbox surface (threads, one thread, replies)', async () => {
    const app = makeApp()
    const threads = await auth(request(app).get(`/api/partner/inbox/threads?hub_user_id=${RECEPTION_HUB_ID}`))
    expect(threads.status).toBe(200)

    // A thread she can't see is a 404 (resource), never a 403 (identity).
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const one = await auth(request(app).get(`/api/partner/inbox/threads/c-1?hub_user_id=${RECEPTION_HUB_ID}`))
    expect(one.status).toBe(404)

    const reply = await auth(request(app).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: RECEPTION_HUB_ID, content: 'Hello' })
    expect(reply.status).toBe(404)
  })

  it('gives her an unread badge too — summary uses the same membership check', async () => {
    prismaMock.conversation.count.mockResolvedValue(3)
    const res = await auth(request(makeApp()).get(`/api/partner/inbox/summary?hub_user_id=${RECEPTION_HUB_ID}`))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 3 })
    expect(prismaMock.conversation.count.mock.calls[0][0].where).toMatchObject({ staffId: 'u-new', kind: 'STAFF' })
  })

  it('summary still answers { unread: 0 } (never 403/500) for an id Hub does not know', async () => {
    hubMisMock.listStaff.mockResolvedValue([])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=ghost'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 0 })
  })

  it('403s when Hub does not list the id as staff — and provisions nothing', async () => {
    hubMisMock.listStaff.mockResolvedValue([{ ...HUB_RECEPTION, hubUserId: 'someone-else' }])
    const res = await auth(
      request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`),
    )
    expect(res.status).toBe(403)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('403s (never 500s) when Hub is unreachable, and backs off instead of retrying every request', async () => {
    hubMisMock.listStaff.mockRejectedValue(new Error('hub down'))
    const app = makeApp()
    const first = await auth(request(app).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}`))
    const second = await auth(request(app).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}`))
    expect(first.status).toBe(403)
    expect(second.status).toBe(403)
    expect(hubMisMock.listStaff).toHaveBeenCalledTimes(1)
  })

  it('caches the per-school staff list across polls', async () => {
    const app = makeApp()
    await auth(request(app).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`))
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-new', role: 'STAFF', schoolId: 'sch-1', name: 'Amal Qanda' })
    await auth(request(app).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`))
    // Second call resolves locally — no Hub round-trip at all.
    expect(hubMisMock.listStaff).toHaveBeenCalledTimes(1)
  })

  it('school_id narrows the lookup to that school (Hub or Connect id)', async () => {
    await auth(
      request(makeApp()).get(
        `/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school&school_id=hub-sch-1`,
      ),
    )
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ hubSchoolId: 'hub-sch-1' }, { id: 'hub-sch-1' }] },
      select: { id: true, hubSchoolId: true },
    })
    expect(prismaMock.school.findMany).not.toHaveBeenCalled()
  })

  it('never promotes an ILSA — a local ILSA actor resolves as ILSA without any Hub staff lookup', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'ilsa-1', role: 'ILSA', schoolId: 'sch-1', name: 'Ms Support' })
    prismaMock.ilsaLink.findFirst.mockResolvedValue({ studentId: 'stu-1', hubPupilId: 'hp-1' })
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' }, parentLinks: [],
    })

    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hu-ilsa&scope=school'))

    expect(res.status).toBe(200)
    // Pupil-scoped, whatever `scope` says — and Hub was never consulted.
    expect(res.body.recipients).toHaveLength(1)
    expect(hubMisMock.listStaff).not.toHaveBeenCalled()
  })

  it('never promotes an ILSA reached through the Hub staff list either', async () => {
    // Hub lists the id as staff, but the Connect row behind it is an ILSA.
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'ilsa-1', role: 'ILSA', schoolId: 'sch-1', name: 'Ms Support' })
    const res = await auth(
      request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}&scope=school`),
    )
    expect(res.status).toBe(403)
  })

  it('still 401s without a partner token — the fallback is not an auth bypass', async () => {
    expect(TOKEN_HASH).toBeTruthy()
    const res = await request(makeApp()).get(`/api/partner/inbox/recipients?hub_user_id=${RECEPTION_HUB_ID}`)
    expect(res.status).toBe(401)
    expect(hubMisMock.listStaff).not.toHaveBeenCalled()
  })
})
