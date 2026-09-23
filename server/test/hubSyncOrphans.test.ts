import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Connect staff accounts holding a Hub id that Hub no longer returns.
 *
 * Hub does not announce a retired or re-issued login. It has the fact — it
 * records the previous id in its own audit log when an admin re-links a staff
 * member — but the feed Connect consumes carried only the new one. So from
 * here, an account whose Hub identity was replaced simply stops being visited
 * by the sync and stands there for ever, unchanged, offered in every picker.
 *
 * At VHPS that was three accounts. One of them was the assignee of a PUBLISHED
 * SCHOOL CONTACT whose email domain was misspelled — parents could tap it,
 * nobody could receive it, for two months. It took a hand-written query to
 * find, and neither product had ever mentioned it.
 *
 * REPORTED, NEVER ACTED ON. An id leaving the feed means "Hub re-issued it"
 * just as plausibly as "paging bug", "permissions change" or "school
 * unlinked", and the cost of guessing wrong is moving families' conversations
 * onto the wrong account. Hub's forthcoming `previousUserId` on a re-link is
 * the signal that can be acted on. This is only the one that says look.
 */

const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn() },
  yearGroup: { upsert: vi.fn(), create: vi.fn() },
  class: { upsert: vi.fn(), create: vi.fn() },
  student: { upsert: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  refreshToken: { findFirst: vi.fn() },
  parentStudentLink: { upsert: vi.fn(), create: vi.fn() },
  staffClassAssignment: { findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/hubMis', () => ({
  listYearGroups: vi.fn(), listClasses: vi.fn(), listPupils: vi.fn(),
  listStaff: vi.fn(), listGuardians: vi.fn(),
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

/** A staff member Hub still returns. */
function inHub(hubUserId: string, first = 'Current', last = 'Person') {
  return {
    id: 'hs-' + hubUserId, firstName: first, lastName: last,
    email: `${hubUserId}@school.ae`, jobTitle: null,
    hubUserId, globalRoles: ['TEACHER'], isInviteAccepted: true,
  } as never
}

/** A Connect row linked to some Hub id. */
function connectRow(hubUserId: string, over: Record<string, unknown> = {}) {
  return {
    name: 'Danielle Barratt-Duffy',
    email: 'dduffy@vhprimaycoa.ae',
    hubUserId,
    leftAt: null,
    lastLoginAt: null,
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
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.update.mockResolvedValue({})
  prismaMock.user.create.mockResolvedValue({ id: 'cu-new' })
})

describe('orphaned staff accounts', () => {
  it('names an account whose Hub id has vanished from the roster', async () => {
    mStaff.mockResolvedValue([inHub('hub-a'), inHub('hub-b'), inHub('hub-c')])
    prismaMock.user.findMany.mockResolvedValue([
      connectRow('hub-a', { name: 'Ann A', email: 'a@school.ae' }),
      connectRow('hub-b', { name: 'Bea B', email: 'b@school.ae' }),
      connectRow('hub-gone'),
    ])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans.total).toBe(1)
    expect(s.staffOrphans.unmarked).toBe(1)
    expect(s.staffOrphans.accounts).toEqual([
      { name: 'Danielle Barratt-Duffy', email: 'dduffy@vhprimaycoa.ae', lastLoginAt: null },
    ])
    expect(s.staffOrphans.refused).toBeUndefined()
  })

  it('reports nothing when every linked row still resolves', async () => {
    mStaff.mockResolvedValue([inHub('hub-a'), inHub('hub-b')])
    prismaMock.user.findMany.mockResolvedValue([connectRow('hub-a'), connectRow('hub-b')])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans).toEqual({ total: 0, unmarked: 0, accounts: [] })
  })

  it('counts an orphan that is already marked, but does not chase it', async () => {
    // Somebody has dealt with it. Repeating the name every sync for ever turns
    // the number into wallpaper, and wallpaper is what hid this in the first
    // place — so `unmarked` is the actionable count and `total` keeps the truth.
    mStaff.mockResolvedValue([inHub('hub-a'), inHub('hub-b'), inHub('hub-c')])
    prismaMock.user.findMany.mockResolvedValue([
      connectRow('hub-a', { name: 'Ann A', email: 'a@school.ae' }),
      connectRow('hub-b', { name: 'Bea B', email: 'b@school.ae' }),
      connectRow('hub-gone', { leftAt: new Date('2026-09-23T00:00:00.000Z') }),
    ])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans.total).toBe(1)
    expect(s.staffOrphans.unmarked).toBe(0)
    expect(s.staffOrphans.accounts).toEqual([])
  })

  it('never acts on what it finds — no update, no delete', async () => {
    mStaff.mockResolvedValue([inHub('hub-a'), inHub('hub-b')])
    prismaMock.user.findMany.mockResolvedValue([
      connectRow('hub-a', { name: 'Ann A', email: 'a@school.ae' }),
      connectRow('hub-gone'),
    ])

    await syncSchoolFromHub('connect-school-1')

    // The staff pass updates rows it matched; nothing here writes to the orphan.
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user).not.toHaveProperty('delete')
  })
})

describe('the floor — what stops this accusing the whole school', () => {
  it('refuses when Hub returns no staff at all', async () => {
    // A failed or empty staff fetch would otherwise report every linked account
    // as orphaned: alarming, wrong, and exactly what somebody acts on at 6pm.
    mStaff.mockResolvedValue([])
    prismaMock.user.findMany.mockResolvedValue([connectRow('hub-a'), connectRow('hub-b')])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans.refused).toMatch(/no staff at all/)
    expect(s.staffOrphans.total).toBe(0)
    expect(s.staffOrphans.accounts).toEqual([])
  })

  it('refuses when more than half the linked staff are missing', async () => {
    mStaff.mockResolvedValue([inHub('hub-a')])
    prismaMock.user.findMany.mockResolvedValue([
      connectRow('hub-a', { name: 'Ann A', email: 'a@school.ae' }),
      connectRow('hub-x', { name: 'X', email: 'x@school.ae' }),
      connectRow('hub-y', { name: 'Y', email: 'y@school.ae' }),
    ])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans.refused).toMatch(/refusing to call that orphaned/)
    expect(s.staffOrphans.unmarked).toBe(0)
  })

  it('says nothing at all when no staff are linked yet', async () => {
    // Mid-onboarding. Nothing to be wrong about, and no reason to alarm anyone.
    mStaff.mockResolvedValue([])
    prismaMock.user.findMany.mockResolvedValue([])

    const s = await syncSchoolFromHub('connect-school-1')

    expect(s.staffOrphans).toEqual({ total: 0, unmarked: 0, accounts: [] })
  })

  it('asks only about this school, staff roles, and real accounts', async () => {
    mStaff.mockResolvedValue([inHub('hub-a')])
    await syncSchoolFromHub('connect-school-1')

    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('connect-school-1')
    expect(where.hubUserId).toEqual({ not: null })
    expect(where.isTest).toBe(false)
    expect(where.role.in).toContain('STAFF')
    expect(where.role.in).not.toContain('PARENT')
  })
})
