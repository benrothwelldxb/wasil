import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A group's managers, over the partner API.
 *
 * Desk asked for a group to have an owner who can edit it and message its
 * parents without whole-school rights. Connect already had the model —
 * StaffGroupAssignment, canMessage / canManage — but nothing read it, so the
 * first half of the change is canSendToTarget enforcing canMessage and the
 * second is this: Desk reading and setting managers by Hub user id, since it
 * never holds a Connect User.id.
 *
 * The two things these tests hold are the ones a wrong guess would cost most:
 * setting rights is all or nothing (a list that silently dropped a leaver
 * would leave a group nobody is looking after), and a group whose membership
 * another system owns cannot be handed to a person.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  school: { findFirst: vi.fn(), findMany: vi.fn() },
  group: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  staffGroupAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
  auditLog: { create: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))
vi.mock('../src/services/serviceGroups', () => ({
  refreshServiceGroup: vi.fn(),
  refreshServiceGroupsForSchool: vi.fn(),
}))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer cpk_secret')

const PAST = new Date('2026-07-10T00:00:00.000Z')

const ADMIN = { id: 'u-admin', hubUserId: 'hu-admin', role: 'ADMIN', schoolId: 'sch-1', name: 'Head', leftAt: null, accessRevokedAt: null }
const TEACHER = { id: 'u-teach', hubUserId: 'hu-teach', role: 'STAFF', schoolId: 'sch-1', name: 'Sarah Khan', leftAt: null, accessRevokedAt: null }
const LEAVER = { id: 'u-gone', hubUserId: 'hu-gone', role: 'STAFF', schoolId: 'sch-1', name: 'Gone', leftAt: PAST, accessRevokedAt: null }

const HAND_GROUP = { id: 'g-1', name: 'Swimming squad', externalRef: null, sourceServiceId: null, ecaActivity: null }

function actorIs(user: typeof ADMIN) {
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { hubUserId?: string } }) =>
    [ADMIN, TEACHER, LEAVER].find(u => u.hubUserId === where.hubUserId) ?? (where.hubUserId === user.hubUserId ? user : null))
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1' })
  prismaMock.group.findFirst.mockResolvedValue({ id: 'g-1' })
  prismaMock.group.findUnique.mockResolvedValue({ ...HAND_GROUP, staffManagers: [] })
  prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { hubUserId: { in: string[] } } }) =>
    [ADMIN, TEACHER, LEAVER].filter(u => where.hubUserId.in.includes(u.hubUserId)))
  actorIs(ADMIN)
})

const put = (body: Record<string, unknown>) =>
  auth(request(makeApp()).put('/api/partner/groups/g-1/managers').send({ hub_user_id: 'hu-admin', ...body }))

describe('PUT /groups/:id/managers', () => {
  it('replaces the managers, keyed by Hub user id, defaulting to message-only', async () => {
    const res = await put({ managers: [{ hubUserId: 'hu-teach', canManage: true }] })

    expect(res.status).toBe(200)
    expect(prismaMock.staffGroupAssignment.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g-1' } })
    expect(prismaMock.staffGroupAssignment.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u-teach', groupId: 'g-1', canMessage: true, canManage: true }],
    })
    expect(prismaMock.auditLog.create).toHaveBeenCalled()
  })

  it('accepts an empty list, which leaves the group with no managers', async () => {
    const res = await put({ managers: [] })
    expect(res.status).toBe(200)
    expect(prismaMock.staffGroupAssignment.deleteMany).toHaveBeenCalled()
    expect(prismaMock.staffGroupAssignment.createMany).toHaveBeenCalledWith({ data: [] })
  })

  // Granting messaging rights is the same decision as whole-school broadcast.
  it('refuses a non-admin with forbidden', async () => {
    actorIs(TEACHER)
    const res = await auth(request(makeApp()).put('/api/partner/groups/g-1/managers')
      .send({ hub_user_id: 'hu-teach', managers: [{ hubUserId: 'hu-teach', canManage: true }] }))

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden' })
    expect(prismaMock.staffGroupAssignment.deleteMany).not.toHaveBeenCalled()
  })

  // The case a partial write would get wrong: the admin thinks the group is
  // looked after, and the one person named has gone.
  it('refuses the whole list when one manager has left, naming them', async () => {
    const res = await put({ managers: [{ hubUserId: 'hu-teach' }, { hubUserId: 'hu-gone' }] })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'unresolved_managers', unresolved: [{ hubUserId: 'hu-gone', reason: 'has_left' }] })
    expect(prismaMock.staffGroupAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('reports a Hub id nobody at the school holds as not_known', async () => {
    const res = await put({ managers: [{ hubUserId: 'hu-stranger' }] })

    expect(res.status).toBe(400)
    expect(res.body.unresolved).toEqual([{ hubUserId: 'hu-stranger', reason: 'not_known' }])
  })

  it('refuses a group whose membership another system owns', async () => {
    prismaMock.group.findUnique.mockResolvedValue({ ...HAND_GROUP, externalRef: 'bus-route:12' })
    const res = await put({ managers: [{ hubUserId: 'hu-teach' }] })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'managers_owned_elsewhere', source: 'published' })
    expect(prismaMock.staffGroupAssignment.deleteMany).not.toHaveBeenCalled()
  })

  // The explicit claim, not just the ref convention: Beyond's trip groups.
  it('refuses a group a partner claims with managedBy', async () => {
    prismaMock.group.findUnique.mockResolvedValue({ ...HAND_GROUP, managedBy: 'beyond' })
    const res = await put({ managers: [{ hubUserId: 'hu-teach' }] })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'managers_owned_elsewhere', source: 'published' })
  })

  it('refuses a duplicate rather than guessing which flags were meant', async () => {
    const res = await put({ managers: [{ hubUserId: 'hu-teach' }, { hubUserId: 'hu-teach', canManage: true }] })
    expect(res.status).toBe(400)
    expect(prismaMock.staffGroupAssignment.deleteMany).not.toHaveBeenCalled()
  })
})

describe('managers on the group reads', () => {
  const managers = [{ canMessage: true, canManage: true, user: { hubUserId: 'hu-teach', name: 'Sarah Khan' } }]

  it('lists each group with its managers and where its membership comes from', async () => {
    prismaMock.group.findMany.mockResolvedValue([
      { ...HAND_GROUP, staffManagers: managers, _count: { studentMembers: 12 } },
      { id: 'g-2', name: 'Bus — Route 12', externalRef: 'bus-route:12', sourceServiceId: null, ecaActivity: null, staffManagers: [], _count: { studentMembers: 30 } },
    ])

    const res = await auth(request(makeApp()).get('/api/partner/groups?school_id=sch-1'))

    expect(res.status).toBe(200)
    expect(res.body.groups[0]).toEqual({
      id: 'g-1', name: 'Swimming squad', memberCount: 12, externalRef: null, managedBy: null,
      source: 'hand', managersEditable: true,
      staffManagers: [{ hubUserId: 'hu-teach', name: 'Sarah Khan', canMessage: true, canManage: true }],
    })
    expect(res.body.groups[1]).toMatchObject({ source: 'published', managersEditable: false, staffManagers: [] })
  })

  // A leaver grants nothing, so the read must not show them as an owner.
  it('asks only for managers who are still at the school', async () => {
    prismaMock.group.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/groups?school_id=sch-1'))

    const select = prismaMock.group.findMany.mock.calls[0][0].select
    expect(select.staffManagers.where.user).toMatchObject({ accessRevokedAt: null })
  })

  it('includes the managers on a single group', async () => {
    prismaMock.group.findFirst
      .mockResolvedValueOnce({ id: 'g-1' })
      .mockResolvedValueOnce({ ...HAND_GROUP, staffManagers: managers, studentMembers: [] })

    const res = await auth(request(makeApp()).get('/api/partner/groups/g-1?hub_user_id=hu-admin'))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: 'g-1', source: 'hand', managersEditable: true,
      staffManagers: [{ hubUserId: 'hu-teach', name: 'Sarah Khan', canMessage: true, canManage: true }],
      members: [],
    })
  })
})
