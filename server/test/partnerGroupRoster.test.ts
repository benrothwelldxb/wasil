import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A group's whole roster, replaced: PUT /api/partner/groups/:ref/roster.
 *
 * Beyond narrows a trip group at the consent deadline and moves it with every
 * booking and waiting-list change. With only add/remove deltas it must diff
 * against what it last sent, and two retries out of order can put a removed
 * family back. So it sends the list it wants, with a version, and Connect
 * applies it only when newer — the same rules as the club roster door.
 *
 * The rule that differs from the club door, and is pinned here: a group is a
 * live messaging audience, so it is never emptied and refilled.
 */

const prismaMock = {
  school: { findUnique: vi.fn() },
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  group: { findFirst: vi.fn(), update: vi.fn() },
  student: { findMany: vi.fn() },
  studentGroupLink: { createMany: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const REF = 'beyond:trip:t-1'
const GROUP = {
  id: 'g-1', isActive: true, managedBy: 'beyond', externalRef: REF, sourceServiceId: null,
  rosterVersion: new Date('2026-10-20T08:00:00.000Z'),
}

const push = (body: Record<string, unknown>) =>
  request(makeApp())
    .put(`/api/partner/groups/${REF}/roster`)
    .set('Authorization', 'Bearer tok')
    .send({ hub_user_id: 'hub-staff-1', version: '2026-10-21T08:00:00.000Z', ...body })

beforeEach(() => {
  vi.clearAllMocks()
  // The school has turned Wasil Beyond on (services/partnerSwitch).
  prismaMock.school.findUnique.mockResolvedValue({ beyondEnabled: true })
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'beyond', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  // Addressed by ref: the id lookup misses, the ref lookup finds it.
  prismaMock.group.findFirst.mockImplementation(async (args: any) => (args?.where?.externalRef === REF ? GROUP : null))
  prismaMock.group.update.mockResolvedValue({})
  prismaMock.studentGroupLink.deleteMany.mockResolvedValue({ count: 1 })
  prismaMock.studentGroupLink.createMany.mockResolvedValue({ count: 2 })
  const ROLL: Record<string, string> = { 'hub-p1': 'stu-1', 'hub-p2': 'stu-2' }
  prismaMock.student.findMany.mockImplementation(async (args: any) => {
    const asked: string[] = args?.where?.hubPupilId?.in ?? []
    return asked.filter(h => ROLL[h]).map(h => ({ id: ROLL[h], hubPupilId: h }))
  })
})

describe('replacing a group roster', () => {
  it('removes everyone not listed and adds everyone listed', async () => {
    const res = await push({ pupilHubIds: ['hub-p1', 'hub-p2'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'g-1', members: 2, removed: 1 })
    expect(prismaMock.studentGroupLink.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'g-1', studentId: { notIn: ['stu-1', 'stu-2'] } },
    })
    expect(prismaMock.studentGroupLink.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 'stu-1', groupId: 'g-1' }, { studentId: 'stu-2', groupId: 'g-1' }],
      skipDuplicates: true,
    })
  })

  it('never empties the group on the way, because it is a live audience', async () => {
    await push({ pupilHubIds: ['hub-p1'] })
    // A deleteMany on the whole group would leave a moment with nobody in it.
    for (const [args] of prismaMock.studentGroupLink.deleteMany.mock.calls) {
      expect(args.where.studentId).toBeDefined()
    }
  })

  it('stamps the version after the members, so a failure part way is retried whole', async () => {
    await push({ pupilHubIds: ['hub-p1'] })
    expect(prismaMock.group.update).toHaveBeenCalledWith({
      where: { id: 'g-1' }, data: { rosterVersion: new Date('2026-10-21T08:00:00.000Z') },
    })
    const stamp = prismaMock.group.update.mock.invocationCallOrder[0]
    expect(stamp).toBeGreaterThan(prismaMock.studentGroupLink.createMany.mock.invocationCallOrder[0])
  })

  it('clears the group on an explicit empty list', async () => {
    const res = await push({ pupilHubIds: [] })
    expect(res.status).toBe(200)
    expect(res.body.members).toBe(0)
    expect(prismaMock.studentGroupLink.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'g-1', studentId: { notIn: [] } },
    })
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
  })

  it('refuses a missing list rather than reading it as nobody', async () => {
    const res = await push({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('pupilHubIds required')
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
  })

  it('requires a version', async () => {
    const res = await push({ version: undefined, pupilHubIds: [] })
    expect(res.status).toBe(400)
  })

  it('ignores an older or equal version, and answers 200', async () => {
    for (const version of ['2026-10-19T08:00:00.000Z', '2026-10-20T08:00:00.000Z']) {
      const res = await push({ version, pupilHubIds: ['hub-p1'] })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'g-1', ignored: true, reason: 'stale_version' })
    }
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.group.update).not.toHaveBeenCalled()
  })

  it('applies the first roster a group has ever had', async () => {
    prismaMock.group.findFirst.mockImplementation(async (args: any) =>
      args?.where?.externalRef === REF ? { ...GROUP, rosterVersion: null } : null)
    const res = await push({ pupilHubIds: ['hub-p1'] })
    expect(res.body.members).toBe(1)
  })

  it('names the pupils it does not know and applies the rest', async () => {
    const res = await push({ pupilHubIds: ['hub-p1', 'hub-gone'] })
    expect(res.body).toMatchObject({ members: 1, unknownPupilIds: ['hub-gone'] })
  })

  it('404s a group that was never published', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null)
    const res = await push({ pupilHubIds: [] })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('unknown_group')
  })

  it('refuses an archived group', async () => {
    prismaMock.group.findFirst.mockImplementation(async (args: any) =>
      args?.where?.externalRef === REF ? { ...GROUP, isActive: false } : null)
    const res = await push({ pupilHubIds: ['hub-p1'] })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('group_archived')
  })

  it('refuses another app', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-2', name: 'desk', revokedAt: null })
    const res = await push({ pupilHubIds: [] })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('group_managed_elsewhere')
    expect(prismaMock.studentGroupLink.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses a service group, whose members the service decides', async () => {
    prismaMock.group.findFirst.mockImplementation(async (args: any) =>
      args?.where?.externalRef === REF ? { ...GROUP, sourceServiceId: 'svc-1' } : null)
    const res = await push({ pupilHubIds: [] })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('group_membership_owned_by_service')
  })
})
