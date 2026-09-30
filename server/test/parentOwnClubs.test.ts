import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Which clubs THIS family's children are actually in.
 *
 * Active publishes a club's roster as a group and links it to the activity, so
 * Connect already held the membership — the page simply never looked. Every
 * parent was shown all twenty-seven clubs and left to find the two their child
 * attends.
 *
 * PARTIAL BY NATURE, and that is the whole design constraint. Only some
 * activities carry a roster — eight of twenty-seven at the first school — so
 * this can say which clubs a child IS in and can NEVER say which they are not.
 *
 * Which is why it is an addition above the programme and never a filter of it.
 * A parent whose child's club has no roster pushed must keep seeing exactly
 * what they saw yesterday; an empty "your clubs" reads as their child having
 * been dropped from something, and that is a phone call to the office about a
 * problem that does not exist.
 */

const prismaMock = {
  ecaTerm: { findFirst: vi.fn() },
  ecaActivity: { findMany: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  ecaActivityMember: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  ecaSettings: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({
    id: 'parent-1',
    schoolId: 'school-1',
    studentLinks: [{ studentId: 'stu-1' }, { studentId: 'stu-2' }],
  })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({
  sendEcaRegistrationOpenNotification: vi.fn(),
  sendEcaAllocationResultsNotification: vi.fn(),
  sendEcaInvitationNotification: vi.fn(),
}))
vi.mock('../src/services/ecaAllocation', () => ({ runAllocation: vi.fn(), previewAllocation: vi.fn() }))
vi.mock('../src/services/ecaPdf', () => ({ generateAttendanceRegisterHtml: vi.fn(), generateBlankRegisterHtml: vi.fn() }))

const { default: ecaRoutes } = await import('../src/routes/eca')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/eca', ecaRoutes)
  return app
}

function activity(over: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    name: 'Swim Squad',
    description: null,
    category: { name: 'Sport' },
    location: 'Pool',
    isCancelled: false,
    cancelReason: null,
    activityType: 'OPEN',
    eligibleGender: null,
    eligibleYearGroupIds: [],
    groupId: 'grp-swim',
    dayOfWeek: 2,
    customStartTime: '15:30',
    customEndTime: '16:30',
    meetings: [{ dayOfWeek: 2, startTime: '15:30', endTime: '16:30' }],
    ...over,
  }
}

const programme = () => request(makeApp()).get('/api/eca/parent/programme')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.ecaTerm.findFirst.mockResolvedValue({
    id: 'term-1', name: 'Autumn Term', academicYear: '2026/27', status: 'DRAFT',
    startDate: new Date('2026-08-31'), endDate: new Date('2026-12-11'),
  })
  prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
  prismaMock.school.findUnique.mockResolvedValue({ activitiesSignUpUrl: null })
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.ecaActivity.findMany.mockResolvedValue([activity()])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.ecaActivityMember.findMany.mockResolvedValue([])
})

describe('a club with a roster', () => {
  it('names this parent’s child on it', async () => {
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-swim', student: { id: 'stu-1', firstName: 'Idris' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren).toEqual(['Idris'])
  })

  it('names both when two siblings are in the same club', async () => {
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-swim', student: { id: 'stu-1', firstName: 'Idris' } },
      { groupId: 'grp-swim', student: { id: 'stu-2', firstName: 'Leyla' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren).toEqual(['Idris', 'Leyla'])
  })

  it('asks only about THIS parent’s children', async () => {
    // The roster holds every child in the club. A parent must never learn who
    // else is on it from this route.
    prismaMock.studentGroupLink.findMany.mockResolvedValue([])

    await programme()

    const where = prismaMock.studentGroupLink.findMany.mock.calls[0][0].where
    expect(where.studentId).toEqual({ in: ['stu-1', 'stu-2'] })
    expect(where.groupId).toEqual({ in: ['grp-swim'] })
  })

  it('leaves it empty for a club this family is not on', async () => {
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-other', student: { id: 'stu-1', firstName: 'Idris' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren).toEqual([])
  })
})

describe('a club with NO roster', () => {
  it('still appears, with an empty list rather than being hidden', async () => {
    // NINETEEN OF TWENTY-SEVEN at the first school. Empty means "not on a
    // roster we hold", never "not in the club" — so the programme must show it
    // exactly as before.
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'act-2', name: 'Latin Y4-6', groupId: null }),
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].name).toBe('Latin Y4-6')
    expect(res.body.days[0].activities[0].myChildren).toEqual([])
  })

  it('does not go looking for groups when no activity has one', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ groupId: null })])

    await programme()

    expect(prismaMock.studentGroupLink.findMany).not.toHaveBeenCalled()
  })
})

describe('the whole programme is never filtered by this', () => {
  it('returns every eligible club whether or not the family is on it', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'a1', name: 'Swim Squad', groupId: 'grp-swim' }),
      activity({ id: 'a2', name: 'Latin Y4-6', groupId: null }),
      activity({ id: 'a3', name: 'Book Club', groupId: 'grp-book' }),
    ])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-swim', student: { id: 'stu-1', firstName: 'Idris' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities.map((a: { name: string }) => a.name).sort())
      .toEqual(['Book Club', 'Latin Y4-6', 'Swim Squad'])
  })
})


/**
 * THE SECOND SOURCE, and the reason it exists.
 *
 * A roster could previously reach Connect only as a GROUP, and a group is a
 * messaging audience: it appears in the broadcast composer and on the Groups
 * page. So carrying a register that way means creating a new way to message a
 * school for every club that wants one. The first school ticked it for eleven
 * of twenty-seven clubs and stopped — entirely reasonably — and the children in
 * the other sixteen were invisible in the app as a result.
 *
 * A roster published with the activity itself grants nothing. Both paths are
 * read, because a parent must not have to care which one their school used.
 */
describe('a roster published with the activity, with no group at all', () => {
  it('names the child, though the club has no group', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'act-9', name: 'Makerspace Y2-3', groupId: null }),
    ])
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { ecaActivityId: 'act-9', student: { id: 'stu-1', firstName: 'Idris' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren).toEqual(['Idris'])
  })

  it('asks only about THIS parent’s children', async () => {
    await programme()

    const where = prismaMock.ecaActivityMember.findMany.mock.calls[0][0].where
    expect(where.studentId).toEqual({ in: ['stu-1', 'stu-2'] })
    expect(where.ecaActivityId).toEqual({ in: ['act-1'] })
  })
})

describe('a club that has both', () => {
  it('names the child once, not twice', async () => {
    // Legitimate overlap: a school that wants the club to be a messaging
    // audience keeps its group, and Active publishes the roster too. Being
    // listed twice in your own child's club list reads as a system that has
    // lost count of your children.
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { ecaActivityId: 'act-1', student: { id: 'stu-1', firstName: 'Idris' } },
    ])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-swim', student: { id: 'stu-1', firstName: 'Idris' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren).toEqual(['Idris'])
  })

  it('still names a sibling who is only in one of them', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { ecaActivityId: 'act-1', student: { id: 'stu-1', firstName: 'Idris' } },
    ])
    prismaMock.studentGroupLink.findMany.mockResolvedValue([
      { groupId: 'grp-swim', student: { id: 'stu-2', firstName: 'Leyla' } },
    ])

    const res = await programme()

    expect(res.body.days[0].activities[0].myChildren.sort()).toEqual(['Idris', 'Leyla'])
  })
})

/**
 * WHAT AN EMPTY LIST MEANS, and why the page has to be told.
 *
 * While only some clubs keep a register, an empty "your child's clubs" means
 * "no register was published" and the page must stay silent — a child could be
 * in three clubs that simply do not publish one, and "not in any clubs" would
 * be a flat lie.
 *
 * Once every club publishes one, the absence becomes a fact worth stating: a
 * parent who expected their child to be in something learns there is a problem
 * instead of staring at a screen that never mentions it.
 *
 * MEASURED BY WHETHER A REGISTER WAS PUBLISHED, never by whether anyone is on
 * it. A club can legitimately be empty, and a member count cannot tell that
 * apart from a roster that never arrived.
 */
describe('whether every club has published a register', () => {
  it('is false while some clubs have none', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'a1', rosterVersion: new Date('2026-09-30'), groupId: null }),
      activity({ id: 'a2', rosterVersion: null, groupId: null }),
    ])

    const res = await programme()

    expect(res.body.registersComplete).toBe(false)
  })

  it('is true when every club has one', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'a1', rosterVersion: new Date('2026-09-30'), groupId: null }),
      activity({ id: 'a2', rosterVersion: new Date('2026-09-30'), groupId: null }),
    ])

    const res = await programme()

    expect(res.body.registersComplete).toBe(true)
  })

  it('counts a club that published an EMPTY register as covered', async () => {
    // The whole reason this is measured on rosterVersion rather than on member
    // count. A club nobody joined has still answered the question.
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'a1', rosterVersion: new Date('2026-09-30'), groupId: null }),
    ])
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([])

    const res = await programme()

    expect(res.body.registersComplete).toBe(true)
  })

  it('counts a club whose roster arrived as a group', async () => {
    // Eight of twenty-seven arrived the old way and are no less covered for it.
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ id: 'a1', rosterVersion: null, groupId: 'grp-swim' }),
    ])

    const res = await programme()

    expect(res.body.registersComplete).toBe(true)
  })

  it('one failed push anywhere returns the whole page to caution', async () => {
    // The property that matters: a partial sync must never be able to pass
    // itself off as a complete answer.
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      ...Array.from({ length: 26 }, (_, i) =>
        activity({ id: `a${i}`, rosterVersion: new Date('2026-09-30'), groupId: null })),
      activity({ id: 'a-missed', rosterVersion: null, groupId: null }),
    ])

    const res = await programme()

    expect(res.body.registersComplete).toBe(false)
  })

  it('is false for a term with no clubs at all', async () => {
    // Nothing to be complete about. "Every club has a register" must not be
    // vacuously true and license a claim about a programme that is empty.
    prismaMock.ecaActivity.findMany.mockResolvedValue([])

    const res = await programme()

    expect(res.body.registersComplete).toBe(false)
  })
})
