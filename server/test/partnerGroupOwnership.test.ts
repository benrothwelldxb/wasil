import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A group a partner app keeps in step belongs to that app.
 *
 * Beyond publishes each trip's parents' group and narrows it as consent and
 * the waiting list move. If Desk or a Connect admin could edit it by hand, a
 * family added by hand would get the trip's messages until the next sync, and
 * an admin's delete — a HARD delete — would clear groupId on every post sent
 * to the trip. So: owned by the publishing token, refused to everyone else,
 * archived rather than deleted, and never posted to once archived.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  group: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  groupCategory: { findFirst: vi.fn(), findMany: vi.fn() },
  student: { findMany: vi.fn() },
  studentGroupLink: { createMany: vi.fn(), deleteMany: vi.fn() },
  class: { findMany: vi.fn() },
  yearGroup: { findFirst: vi.fn() },
  message: { create: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn(async () => []) }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/serviceGroups', () => ({
  refreshServiceGroup: vi.fn(), refreshServiceGroupsForSchool: vi.fn(),
}))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId: 'school-1', role: 'ADMIN' }
    next()
  }
  return { isAuthenticated: attach, isAdmin: attach, isStaff: attach, loadUserWithRelations: vi.fn() }
})

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: groupRoutes } = await import('../src/routes/groups')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/groups', groupRoutes)
  return app
}

const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')
const asToken = (name: string) =>
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: `pt-${name}`, name, revokedAt: null })

const REF = 'beyond:trip:t-1'
const TRIP_GROUP = { id: 'g-1', isActive: true, managedBy: 'beyond', externalRef: REF, sourceServiceId: null }

beforeEach(() => {
  vi.clearAllMocks()
  // The school has turned Wasil Beyond on (services/partnerSwitch).
  prismaMock.school.findUnique.mockResolvedValue({ beyondEnabled: true })
  asToken('Beyond')
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.student.findMany.mockResolvedValue([])
  prismaMock.group.create.mockResolvedValue({ id: 'g-new' })
  prismaMock.group.update.mockResolvedValue({ id: 'g-1' })
  prismaMock.studentGroupLink.createMany.mockResolvedValue({ count: 0 })
  prismaMock.studentGroupLink.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.message.create.mockResolvedValue({ id: 'm-1' })
})

describe('publishing a group under a ref', () => {
  const publish = (body: Record<string, unknown> = {}) =>
    auth(request(makeApp()).post('/api/partner/groups')).send({
      hub_user_id: 'hub-staff-1', name: 'Year 4 Etihad Museum, 20 Oct', externalRef: REF, pupilHubIds: [], ...body,
    })

  it('stamps the group with the publishing token, lowercased', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null)
    const res = await publish()
    expect(res.status).toBe(201)
    expect(prismaMock.group.create.mock.calls[0][0].data).toMatchObject({ externalRef: REF, managedBy: 'beyond' })
  })

  it('leaves a group made without a ref unmanaged, so its maker can still edit it', async () => {
    asToken('desk')
    prismaMock.group.findFirst.mockResolvedValue(null)
    await publish({ externalRef: undefined })
    expect(prismaMock.group.create.mock.calls[0][0].data.managedBy).toBeUndefined()
  })

  it('refuses another token re-publishing the same ref', async () => {
    asToken('active')
    prismaMock.group.findFirst.mockResolvedValue(TRIP_GROUP)
    const res = await publish()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: 'group_managed_elsewhere', managedBy: 'beyond' })
    expect(prismaMock.group.update).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
  })

  it('claims a group published before ownership existed', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ ...TRIP_GROUP, managedBy: null })
    const res = await publish()
    expect(res.status).toBe(201)
    expect(prismaMock.group.update.mock.calls[0][0].data.managedBy).toBe('beyond')
  })

  it('refuses an archived group unless asked to reopen it', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ ...TRIP_GROUP, isActive: false })
    const res = await publish()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: 'group_archived', id: 'g-1' })
    expect(prismaMock.group.update).not.toHaveBeenCalled()
  })

  it('reopens an archived group when told to, and says so', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ ...TRIP_GROUP, isActive: false })
    const res = await publish({ reopen: true })
    expect(res.status).toBe(201)
    expect(res.body.reopened).toBe(true)
    expect(prismaMock.group.update.mock.calls[0][0].data.isActive).toBe(true)
  })

  it('does not report a reopen on a live group', async () => {
    prismaMock.group.findFirst.mockResolvedValue(TRIP_GROUP)
    const res = await publish({ reopen: true })
    expect(res.body.reopened).toBeUndefined()
    expect(prismaMock.group.update.mock.calls[0][0].data.isActive).toBeUndefined()
  })
})

describe('reading groups', () => {
  it('lists the owner and the ref, so Desk can label a managed group', async () => {
    prismaMock.group.findMany.mockResolvedValue([
      { id: 'g-1', name: 'Trip', externalRef: REF, managedBy: 'beyond', _count: { studentMembers: 54 } },
      { id: 'g-2', name: 'Choir', externalRef: null, managedBy: null, _count: { studentMembers: 12 } },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/groups?school_id=hub-school'))
    expect(res.body.groups).toEqual([
      { id: 'g-1', name: 'Trip', memberCount: 54, externalRef: REF, managedBy: 'beyond' },
      { id: 'g-2', name: 'Choir', memberCount: 12, externalRef: null, managedBy: null },
    ])
  })

  it('returns the owner and the archive state on one group', async () => {
    prismaMock.group.findFirst
      .mockResolvedValueOnce(TRIP_GROUP)
      .mockResolvedValueOnce({ id: 'g-1', name: 'Trip', externalRef: REF, managedBy: 'beyond', isActive: true, studentMembers: [] })
    const res = await auth(request(makeApp()).get(`/api/partner/groups/${REF}?hub_user_id=hub-staff-1`))
    expect(res.body).toMatchObject({ id: 'g-1', managedBy: 'beyond', externalRef: REF, isActive: true })
  })
})

describe('changing a managed group from another app', () => {
  it('refuses a PATCH from another token', async () => {
    asToken('desk')
    prismaMock.group.findFirst.mockResolvedValue(TRIP_GROUP)
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hub-staff-1', addPupilHubIds: ['hub-p1'] })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('group_managed_elsewhere')
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
  })

  it('allows the owner', async () => {
    prismaMock.group.findFirst.mockResolvedValue(TRIP_GROUP)
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hub-staff-1', name: 'Year 4 Etihad Museum, 21 Oct' })
    expect(res.status).toBe(200)
  })

  it('still lets anyone edit an unmanaged group, as before', async () => {
    asToken('desk')
    prismaMock.group.findFirst.mockResolvedValue({ ...TRIP_GROUP, managedBy: null, externalRef: null })
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hub-staff-1', name: 'Choir' })
    expect(res.status).toBe(200)
  })
})

describe('archiving', () => {
  const archive = (idOrRef: string) =>
    auth(request(makeApp()).delete(`/api/partner/groups/${idOrRef}`)).send({ hub_user_id: 'hub-staff-1' })

  it('accepts the externalRef, for a publisher that lost the id', async () => {
    prismaMock.group.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(TRIP_GROUP)
    const res = await archive(REF)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, id: 'g-1' })
    expect(prismaMock.group.update).toHaveBeenCalledWith({ where: { id: 'g-1' }, data: { isActive: false } })
    // Archive, never delete: the trip's message history keeps its link.
    expect(prismaMock.group.delete).not.toHaveBeenCalled()
  })

  it('is a harmless no-op on a group already archived', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ ...TRIP_GROUP, isActive: false })
    const res = await archive('g-1')
    expect(res.status).toBe(200)
    expect(prismaMock.group.update).not.toHaveBeenCalled()
  })

  it('refuses another token', async () => {
    asToken('desk')
    prismaMock.group.findFirst.mockResolvedValue(TRIP_GROUP)
    const res = await archive('g-1')
    expect(res.status).toBe(409)
    expect(prismaMock.group.update).not.toHaveBeenCalled()
  })
})

describe('broadcasting to an archived group', () => {
  it('is refused whole, with no rows written', async () => {
    prismaMock.group.findMany.mockResolvedValue([
      { id: 'g-1', name: 'Trip', isActive: false },
      { id: 'g-2', name: 'Choir', isActive: true },
    ])
    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-staff-1', title: 'Back at school', content: 'Arrived safely.',
      audience: { groupIds: ['g-1', 'g-2'] },
    })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'group_archived', groupIds: ['g-1'] })
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })

  it('still sends to a live group', async () => {
    prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: true }])
    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hub-staff-1', title: 'Back at school', content: 'Arrived safely.',
      audience: { groupIds: ['g-1'] },
    })
    expect(res.status).toBe(201)
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })
})

describe('a Connect admin and a managed group', () => {
  const MANAGED = { id: 'g-1', name: 'Trip', schoolId: 'school-1', managedBy: 'beyond', isActive: true }

  beforeEach(() => prismaMock.group.findFirst.mockResolvedValue(MANAGED))

  it.each([
    ['edit', () => request(makeApp()).put('/api/groups/g-1').send({ name: 'Renamed' })],
    ['delete', () => request(makeApp()).delete('/api/groups/g-1')],
    ['add members', () => request(makeApp()).post('/api/groups/g-1/members').send({ studentIds: ['stu-1'] })],
    ['remove a member', () => request(makeApp()).delete('/api/groups/g-1/members/stu-1')],
  ])('cannot %s it, and is told who can', async (_what, call) => {
    const res = await call()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ code: 'group_managed_elsewhere', managedBy: 'beyond' })
    // The admin client shows `error` as it stands, so it is the sentence.
    expect(res.body.error).toBe('This group is kept up to date by Wasil Beyond. Change it in Wasil Beyond, not here.')
    expect(prismaMock.group.update).not.toHaveBeenCalled()
    expect(prismaMock.group.delete).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
  })

  it('can still delete a group made by hand', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ ...MANAGED, managedBy: null })
    prismaMock.group.delete.mockResolvedValue({})
    const res = await request(makeApp()).delete('/api/groups/g-1')
    expect(res.status).toBe(200)
    expect(prismaMock.group.delete).toHaveBeenCalled()
  })
})
