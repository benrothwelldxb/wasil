import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Staff who have left, and why Connect never noticed them.
 *
 * Every teacher who had ever left VHPS was still in the consultation picker, in
 * the "tag a colleague" list and in the parent contact list, indistinguishable
 * from someone who teaches there tomorrow. Not a sync bug: Hub had been
 * publishing `isArchived` and `leftOn` on every staff record, and our HubStaff
 * type — a hand-copied subset of Hub's DTO — simply didn't have the fields, so
 * they were dropped at the edge and nothing downstream could see them.
 *
 * Two properties matter more than the mechanics, and both are asserted here:
 *
 *  • A LEAVER IS MARKED, NEVER DELETED. Their posts, parent threads and
 *    consultation bookings hang off the row. `leftAt` changes who can be
 *    PICKED; it changes nothing about what can be read.
 *
 *  • SILENCE IS NOT "STILL HERE". If `isArchived` is absent from the payload
 *    the mark is left exactly as it is. An older Hub, a partial deploy or a
 *    dropped field must not un-leave the entire staff list in one run.
 */

const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn() },
  yearGroup: { upsert: vi.fn(), create: vi.fn() },
  class: { upsert: vi.fn(), create: vi.fn() },
  student: { upsert: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  refreshToken: { findFirst: vi.fn() },
  parentStudentLink: { upsert: vi.fn(), create: vi.fn() },
  staffClassAssignment: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/services/hubMis', () => ({
  listYearGroups: vi.fn(),
  listClasses: vi.fn(),
  listPupils: vi.fn(),
  listStaff: vi.fn(),
  listGuardians: vi.fn(),
  HubRosterIncompleteError: class HubRosterIncompleteError extends Error {},
}))
vi.mock('../src/services/hubCalendarSync', () => ({ resyncCalendarForSchool: vi.fn() }))
vi.mock('../src/services/hubIlsaSync', () => ({ syncIlsasForSchool: vi.fn() }))
vi.mock('../src/services/hubTermSync', () => ({ syncTermDates: vi.fn() }))
vi.mock('../src/services/hubEcaTermSync', () => ({ syncEcaTerms: vi.fn() }))

const { listYearGroups, listClasses, listPupils, listStaff, listGuardians } =
  await import('../src/services/hubMis')
const { resyncCalendarForSchool } = await import('../src/services/hubCalendarSync')
const { syncIlsasForSchool } = await import('../src/services/hubIlsaSync')
const { syncTermDates } = await import('../src/services/hubTermSync')
const { syncEcaTerms } = await import('../src/services/hubEcaTermSync')
const { syncSchoolFromHub } = await import('../src/services/hubSync')

const mStaff = vi.mocked(listStaff)

/** A Hub staff record. Tests override only the field under test. */
function hubStaff(over: Record<string, unknown> = {}) {
  return {
    id: 'hs-1',
    firstName: 'Minette',
    lastName: 'Muller',
    email: 'mmuller@school.ae',
    jobTitle: 'Class Teacher',
    hubUserId: 'hub-user-1',
    globalRoles: ['TEACHER'],
    isInviteAccepted: true,
    ...over,
  } as never
}

/** The Connect row Hub's `hubUserId` resolves to. */
function connectUser(over: Record<string, unknown> = {}) {
  return {
    id: 'cu-1',
    role: 'STAFF',
    schoolId: 'connect-school-1',
    email: 'mmuller@school.ae',
    hubUserId: 'hub-user-1',
    leftAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: 'hub-school-1' })
  prismaMock.school.update.mockResolvedValue({})
  vi.mocked(resyncCalendarForSchool).mockResolvedValue(null as never)
  vi.mocked(syncTermDates).mockResolvedValue(null as never)
  vi.mocked(syncEcaTerms).mockResolvedValue(null as never)
  vi.mocked(syncIlsasForSchool).mockResolvedValue(null as never)

  vi.mocked(listYearGroups).mockResolvedValue([])
  vi.mocked(listClasses).mockResolvedValue([])
  vi.mocked(listPupils).mockResolvedValue([])
  vi.mocked(listGuardians).mockResolvedValue([])
  mStaff.mockResolvedValue([])

  prismaMock.student.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.student.count.mockResolvedValue(0)
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([])
  prismaMock.user.update.mockResolvedValue({})
  prismaMock.user.create.mockResolvedValue({ id: 'cu-new' })
  prismaMock.user.findFirst.mockResolvedValue(null)
})

/** The data payload of the single user.update the sync performed. */
function updateData() {
  expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
  return (prismaMock.user.update.mock.calls[0][0] as { data: Record<string, unknown> }).data
}

describe('staff leavers — marking', () => {
  it('stamps leftAt with the date Hub gives', async () => {
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: '2026-07-10' })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser())

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData().leftAt).toEqual(new Date('2026-07-10T00:00:00.000Z'))
    expect(summary.staff.left).toBe(1)
    expect(summary.staff.returned).toBe(0)
  })

  it('falls back to the time it noticed when Hub archives without a date', async () => {
    // Common: plenty of Hub records are archived with no leaving date at all.
    // A date we noticed is worth more than no mark, and the picker only cares
    // that the field is set.
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: null })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser())

    const before = Date.now()
    const summary = await syncSchoolFromHub('connect-school-1')

    const leftAt = updateData().leftAt as Date
    expect(leftAt).toBeInstanceOf(Date)
    expect(leftAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(summary.staff.left).toBe(1)
  })

  it('does not throw, or write an Invalid Date, on a leftOn it cannot parse', async () => {
    // Prisma throws on an Invalid Date, and it would take the whole sync with
    // it — every pupil, guardian and class after this record included.
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: 'not-a-date' })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser())

    const summary = await syncSchoolFromHub('connect-school-1')

    const leftAt = updateData().leftAt as Date
    expect(Number.isNaN(leftAt.getTime())).toBe(false)
    expect(summary.staff.left).toBe(1)
  })

  it('never re-stamps someone already marked', async () => {
    // An exit date that walks forward every night looks authoritative and is
    // the one thing worse than no date at all.
    const stamped = new Date('2026-07-10T00:00:00.000Z')
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: '2026-07-10' })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser({ leftAt: stamped }))

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData()).not.toHaveProperty('leftAt')
    expect(summary.staff.left).toBe(0)
  })

  it('marks through the email fallback too, not just the Hub-id match', async () => {
    // Staff with a pending invite have no hubUserId, so they resolve by email —
    // and they can be archived before they ever accept.
    mStaff.mockResolvedValue([
      hubStaff({ hubUserId: null, isArchived: true, leftOn: '2026-06-30' }),
    ])
    prismaMock.user.findFirst.mockImplementation(async ({ where }: never) => {
      const w = where as { email?: string }
      return w.email === 'mmuller@school.ae' ? connectUser({ hubUserId: null }) : null
    })

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData().leftAt).toEqual(new Date('2026-06-30T00:00:00.000Z'))
    expect(summary.staff.left).toBe(1)
  })

  it('creates an already-archived newcomer marked, rather than active', async () => {
    // The first sync against a school that has had staff come and go.
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: '2025-12-19' })])

    const summary = await syncSchoolFromHub('connect-school-1')

    const createArg = prismaMock.user.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArg.data.leftAt).toEqual(new Date('2025-12-19T00:00:00.000Z'))
    expect(summary.staff).toMatchObject({ created: 1, left: 1 })
  })

  it('creates a current newcomer with no mark', async () => {
    mStaff.mockResolvedValue([hubStaff({ isArchived: false })])

    const summary = await syncSchoolFromHub('connect-school-1')

    const createArg = prismaMock.user.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArg.data.leftAt).toBeNull()
    expect(summary.staff).toMatchObject({ created: 1, left: 0 })
  })
})

describe('staff leavers — clearing and silence', () => {
  it('clears the mark when Hub un-archives someone', async () => {
    // A leaver marked in error and corrected in Hub, or someone who came back.
    // Self-healing, rather than a one-way door needing a hand-written UPDATE.
    mStaff.mockResolvedValue([hubStaff({ isArchived: false })])
    prismaMock.user.findFirst.mockResolvedValue(
      connectUser({ leftAt: new Date('2026-07-10T00:00:00.000Z') }),
    )

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData().leftAt).toBeNull()
    expect(summary.staff.returned).toBe(1)
    expect(summary.staff.left).toBe(0)
  })

  it('leaves a current staff member alone rather than writing leftAt: null every run', async () => {
    mStaff.mockResolvedValue([hubStaff({ isArchived: false })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser())

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData()).not.toHaveProperty('leftAt')
    expect(summary.staff).toMatchObject({ left: 0, returned: 0 })
  })

  it('changes nothing when Hub omits isArchived entirely', async () => {
    // THE IMPORTANT ONE. An older Hub, a partial deploy, or the field simply
    // not sent. Reading absence as "still here" would clear every leaver in
    // the school on a single run, and nothing would report that it had.
    mStaff.mockResolvedValue([hubStaff()])
    prismaMock.user.findFirst.mockResolvedValue(
      connectUser({ leftAt: new Date('2026-07-10T00:00:00.000Z') }),
    )

    const summary = await syncSchoolFromHub('connect-school-1')

    expect(updateData()).not.toHaveProperty('leftAt')
    expect(summary.staff).toMatchObject({ left: 0, returned: 0 })
  })

  it('never deletes a staff row, archived or not', async () => {
    // A leaver's posts, parent threads and bookings hang off this row. The
    // mark is the whole mechanism; deletion is not an option at any point.
    mStaff.mockResolvedValue([hubStaff({ isArchived: true, leftOn: '2026-07-10' })])
    prismaMock.user.findFirst.mockResolvedValue(connectUser())

    await syncSchoolFromHub('connect-school-1')

    expect(prismaMock.user).not.toHaveProperty('delete')
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
  })
})
