import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A club's roster, published with the club.
 *
 * WHY THIS EXISTS. A roster could previously reach Connect only as a GROUP,
 * and a group is a messaging audience: it appears in the broadcast composer and
 * on the Groups page. So carrying a register that way meant creating a new way
 * to message a school for every club that wanted one. The first school ticked
 * that box for eleven of its twenty-seven clubs and stopped — entirely
 * reasonably — and the children in the other sixteen were invisible in the app
 * as a direct result. Two hundred and forty-seven of them.
 *
 * This says which children are in a club and grants nothing else. A school that
 * WANTS a club to be a messaging audience can still have a group; that is now a
 * separate decision from wanting parents to see their own child's timetable.
 *
 * THE CONTRACT THESE TESTS PIN DOWN is absent-versus-empty, because it is the
 * one a publisher can get wrong in a way that silently destroys data.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  ecaActivity: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  ecaTerm: { findFirst: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  ecaCategory: { findFirst: vi.fn() },
  group: { findFirst: vi.fn() },
  student: { findMany: vi.fn() },
  ecaActivityMeeting: { deleteMany: vi.fn(), createMany: vi.fn() },
  ecaActivityMember: { deleteMany: vi.fn(), createMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const push = (body: Record<string, unknown>) =>
  request(makeApp())
    .put('/api/partner/activities/active:activity:91bd411e')
    .set('Authorization', 'Bearer tok')
    .send({
      hub_user_id: 'hub-staff-1',
      name: 'Makerspace Y2-3',
      version: '2026-09-30T08:00:00.000Z',
      hubTermId: 'hub-term-1',
      ...body,
    })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Active', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.user.findFirst.mockResolvedValue(null)
  // The acting staff member is present and not revoked.
  prismaMock.user.findUnique.mockResolvedValue({ leftAt: null, accessRevokedAt: null })
  prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1' })
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', sourceVersion: null, providerId: null })
  prismaMock.ecaActivity.update.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivity.create.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivityMeeting.deleteMany.mockResolvedValue({})
  prismaMock.ecaActivityMeeting.createMany.mockResolvedValue({})
  prismaMock.ecaActivityMember.deleteMany.mockResolvedValue({})
  prismaMock.ecaActivityMember.createMany.mockResolvedValue({})
  // The roll, answered honestly against whatever was asked for. A mock that
  // returns the same two children regardless of the query cannot tell a
  // working filter from a missing one.
  const ROLL: Record<string, string> = { 'hub-p1': 'stu-1', 'hub-p2': 'stu-2' }
  prismaMock.student.findMany.mockImplementation(async (args: any) => {
    const asked: string[] = args?.where?.hubPupilId?.in ?? []
    return asked
      .filter(hubPupilId => ROLL[hubPupilId])
      .map(hubPupilId => ({ id: ROLL[hubPupilId], hubPupilId }))
  })
})

describe('publishing a roster with the activity', () => {
  it('records who is in the club, with no group anywhere', async () => {
    const res = await push({ pupilHubIds: ['hub-p1', 'hub-p2'] })

    expect(res.status).toBe(200)
    expect(prismaMock.ecaActivityMember.createMany).toHaveBeenCalledWith({
      data: [
        { ecaActivityId: 'act-1', studentId: 'stu-1' },
        { ecaActivityId: 'act-1', studentId: 'stu-2' },
      ],
      skipDuplicates: true,
    })
    // The whole point: no group was looked up, created or required.
    expect(prismaMock.group.findFirst).not.toHaveBeenCalled()
  })

  it('says how many landed, so the publisher can check its own arithmetic', async () => {
    const res = await push({ pupilHubIds: ['hub-p1', 'hub-p2'] })
    expect(res.body.enrolled).toBe(2)
  })

  it('replaces the roster rather than adding to it', async () => {
    // A child who has left a club must actually leave it. A register that only
    // ever grows is one nobody can trust.
    await push({ pupilHubIds: ['hub-p1'] })
    expect(prismaMock.ecaActivityMember.deleteMany).toHaveBeenCalledWith({
      where: { ecaActivityId: 'act-1' },
    })
  })

  it('accepts the children it knows and names the ones it does not', async () => {
    // A roster of eighty naming one pupil who has left must publish for the
    // other seventy-nine — and say which one missed.
    // 'hub-gone' is not on the roll, so the honest mock simply does not
    // return it — no override needed.

    const res = await push({ pupilHubIds: ['hub-p1', 'hub-gone'] })

    expect(res.status).toBe(200)
    expect(res.body.enrolled).toBe(1)
    expect(res.body.unknownPupilIds).toEqual(['hub-gone'])
  })

  it('asks only about this school', async () => {
    await push({ pupilHubIds: ['hub-p1'] })
    expect(prismaMock.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: 'school-1' }) }),
    )
  })
})

/**
 * ABSENT IS NOT EMPTY, and a publisher must be able to rely on the difference.
 */
describe('a push that says nothing about the roster', () => {
  it('leaves the roster completely alone', async () => {
    // A publisher that does not hold rosters — or a rename, or a venue change —
    // must not be able to wipe a register by not mentioning it.
    const res = await push({ venue: 'Art Room' })

    expect(res.status).toBe(200)
    expect(prismaMock.ecaActivityMember.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.ecaActivityMember.createMany).not.toHaveBeenCalled()
  })

  it('reports no enrolment figure at all, rather than zero', async () => {
    // Zero would read as "the club is empty", which is a different claim from
    // "I did not say".
    const res = await push({ venue: 'Art Room' })
    expect(res.body.enrolled).toBeUndefined()
  })
})

describe('a push that says the club is empty', () => {
  it('empties it', async () => {
    // An explicit [] means nobody, and must clear a stale register.
    const res = await push({ pupilHubIds: [] })

    expect(res.status).toBe(200)
    expect(prismaMock.ecaActivityMember.deleteMany).toHaveBeenCalledWith({
      where: { ecaActivityId: 'act-1' },
    })
    expect(prismaMock.ecaActivityMember.createMany).not.toHaveBeenCalled()
    expect(res.body.enrolled).toBe(0)
  })
})

describe('a stale push', () => {
  it('does not touch the roster either', async () => {
    // An out-of-order retry recomputing to older state must not roll a register
    // back — the version guard has to cover the roster, not just the catalogue.
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1', sourceVersion: new Date('2026-10-05T00:00:00.000Z'), providerId: null,
    })

    const res = await push({ pupilHubIds: ['hub-p1'] })

    expect(res.body.ignored).toBe(true)
    expect(prismaMock.ecaActivityMember.deleteMany).not.toHaveBeenCalled()
  })
})

/**
 * THE SECOND DOOR, and why it is not a convenience.
 *
 * A register changes when a child is assigned, withdrawn, moved, or comes off a
 * waiting list. None of those are catalogue events. If a roster could only ride
 * the catalogue push it would inherit the catalogue's triggers, so a register
 * would refresh when somebody renamed the club and stay stale for the rest of
 * term — while every sync on both sides reported success.
 *
 * That is exactly the failure that hid 42 children in three clubs for a
 * fortnight: two syncs that never introduce each other, both delivering.
 * Rebuilding it one layer up would be unforgivable.
 */
const rosterPush = (body: Record<string, unknown>) =>
  request(makeApp())
    .put('/api/partner/activities/active:activity:91bd411e/roster')
    .set('Authorization', 'Bearer tok')
    .send({ hub_user_id: 'hub-staff-1', version: '2026-10-01T09:00:00.000Z', ...body })

describe('a roster pushed on its own', () => {
  it('updates the register without re-sending the club', async () => {
    const res = await rosterPush({ pupilHubIds: ['hub-p1'] })

    expect(res.status).toBe(200)
    expect(res.body.enrolled).toBe(1)
    expect(prismaMock.ecaActivityMember.createMany).toHaveBeenCalledWith({
      data: [{ ecaActivityId: 'act-1', studentId: 'stu-1' }],
      skipDuplicates: true,
    })
    // No catalogue write: the club's name, times and venue are untouched.
    expect(prismaMock.ecaActivityMeeting.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses a club it has never heard of, rather than inventing one', async () => {
    // A catalogue entry conjured from a list of children would have no name, no
    // times and no term.
    prismaMock.ecaActivity.findFirst.mockResolvedValue(null)

    const res = await rosterPush({ pupilHubIds: ['hub-p1'] })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('unknown_activity')
  })

  it('insists the list is stated, even when it is empty', async () => {
    // Absence is meaningful on the catalogue push — "this call is not about the
    // roster". Here it is the entire point of the call, so it is malformed
    // rather than a silent no-op.
    const res = await rosterPush({})

    expect(res.status).toBe(400)
    expect(res.body.hint).toContain('[]')
  })

  it('never reaches a club parents have paid for', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1', rosterVersion: null, providerId: 'prov-1',
    })

    const res = await rosterPush({ pupilHubIds: ['hub-p1'] })

    expect(res.status).toBe(409)
    expect(prismaMock.ecaActivityMember.deleteMany).not.toHaveBeenCalled()
  })
})

/**
 * TWO DOORS, ONE ARBITER.
 *
 * The roster carries its own version rather than sharing the catalogue's,
 * because the two facts change at different rates: a venue moves once a term, a
 * child moves out on a Tuesday. Sharing one number would make a roster update
 * claim a newer catalogue version, and would entitle a catalogue retry to roll
 * a register back.
 */
describe('ordering across both doors', () => {
  it('a replayed catalogue push cannot undo a newer roster write', async () => {
    // The club was renamed at 08:00 and a child left at 09:00. The 08:00 push
    // is retried. The rename may re-apply; the register must not.
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1',
      sourceVersion: null,
      providerId: null,
      rosterVersion: new Date('2026-10-01T09:00:00.000Z'),
    })

    const res = await push({ pupilHubIds: ['hub-p1', 'hub-p2'] })

    expect(res.status).toBe(200)
    expect(res.body.rosterIgnored).toBe('stale_version')
    expect(prismaMock.ecaActivityMember.deleteMany).not.toHaveBeenCalled()
    // The catalogue half still applied — the rename is not the roster's
    // business, and refusing the whole push would strand it.
    expect(prismaMock.ecaActivity.update).toHaveBeenCalled()
  })

  it('a replayed roster push cannot undo a newer one', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1', providerId: null, rosterVersion: new Date('2026-10-02T00:00:00.000Z'),
    })

    const res = await rosterPush({ pupilHubIds: ['hub-p1'] })

    expect(res.body.ignored).toBe(true)
    expect(prismaMock.ecaActivityMember.deleteMany).not.toHaveBeenCalled()
  })

  it('stamps the roster clock so the next writer can compare', async () => {
    await rosterPush({ pupilHubIds: ['hub-p1'] })

    expect(prismaMock.ecaActivity.update).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: { rosterVersion: new Date('2026-10-01T09:00:00.000Z') },
    })
  })

  it('a roster arriving with a brand-new club is applied, not deferred', async () => {
    // A new club must arrive complete rather than appearing empty until a
    // second call lands.
    prismaMock.ecaActivity.findFirst.mockResolvedValue(null)

    const res = await push({ pupilHubIds: ['hub-p1'] })

    expect(res.status).toBe(201)
    expect(res.body.enrolled).toBe(1)
  })
})
