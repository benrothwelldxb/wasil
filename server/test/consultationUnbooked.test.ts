import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Who has not booked, and could.
 *
 * The parents who do not book are exactly the ones a school most wants to see,
 * and they were invisible — chasing meant reading a grid of 448 slots and
 * working out who was missing from it.
 *
 * TWO QUALIFICATIONS CARRY THE WHOLE THING, and each has a failure that reads
 * as the school not paying attention:
 *
 *   "COULD" — a family whose wave has not opened is EARLY, not late. Chasing
 *   them asks for something the app will refuse, and the parent cannot tell
 *   those apart. They are counted separately and never listed.
 *
 *   "HAS NOT BOOKED" — per CHILD. A parent with two children who has booked
 *   one is not ignoring anybody, and telling them they have not booked is how
 *   a school loses the benefit of the doubt on everything else it sends.
 */

const prismaMock = {
  consultationEvent: { findFirst: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
  consultationBooking: { findMany: vi.fn() },
  consultationNudge: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { unbookedFamilies } = await import('../src/services/consultationUnbooked')

const NOW = new Date('2026-10-01T14:00:00.000Z')
const EARLIER = new Date('2026-10-01T13:00:00.000Z')
const LATER = new Date('2026-10-01T15:00:00.000Z')

function link(parentId: string, studentId: string, yearGroupId: string | null, firstName = 'Child', over: Record<string, unknown> = {}) {
  return {
    userId: parentId,
    studentId,
    user: { id: parentId, name: `Parent ${parentId}`, email: `${parentId}@x.com`, isTest: false },
    student: { firstName, class: { yearGroupId } },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationEvent.findFirst.mockResolvedValue({ id: 'ce-1', bookingWindows: [] })
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
  prismaMock.consultationBooking.findMany.mockResolvedValue([])
  prismaMock.consultationNudge.findMany.mockResolvedValue([])
})

describe('who counts as not booked', () => {
  it('lists a family with no booking at all', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-2', 'Amina')])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toHaveLength(1)
    expect(r.families[0]).toMatchObject({ parentId: 'p-1', childrenWithout: ['Amina'], bookedCount: 0 })
    // The headline counts CHILDREN, which is what a school can check against
    // its roll. One child, one guardian, one of each here.
    expect(r.childrenWithout).toEqual([
      { studentId: 'stu-1', childName: 'Amina', guardianNames: ['Parent p-1'] },
    ])
    expect(r.childrenEligible).toBe(1)
  })

  it('omits a family whose only child is booked', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-2')])
    prismaMock.consultationBooking.findMany.mockResolvedValue([{ studentId: 'stu-1' }])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toEqual([])
    expect(r.childrenWithout).toEqual([])
    expect(r.childrenEligible).toBe(1)
  })

  it('lists a PARTLY booked family, naming only the child still without', async () => {
    // Telling a parent holding an appointment that they have not booked reads
    // as a system not paying attention.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-1', 'stu-1', 'yg-2', 'Amina'),
      link('p-1', 'stu-2', 'yg-5', 'Yusuf'),
    ])
    prismaMock.consultationBooking.findMany.mockResolvedValue([{ studentId: 'stu-1' }])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families[0]).toMatchObject({ childrenWithout: ['Yusuf'], bookedCount: 1 })
  })

  it('never lists a test account', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-test', 'stu-1', 'yg-2', 'Amina', { user: { id: 'p-test', name: 'Test Parent', email: 't@x.com', isTest: true } }),
    ])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toEqual([])
  })
})

describe('waves — early is not late', () => {
  it('does not list a family whose wave has not opened', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue({
      id: 'ce-1', bookingWindows: [{ yearGroupId: 'yg-5', opensAt: LATER }],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-5')])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toEqual([])
    expect(r.childrenWithout).toEqual([])
    expect(r.childrenWaiting).toBe(1)
    // And not in the denominator either — you cannot be late for something
    // that has not started.
    expect(r.childrenEligible).toBe(0)
  })

  it('lists them once their wave has opened', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue({
      id: 'ce-1', bookingWindows: [{ yearGroupId: 'yg-2', opensAt: EARLIER }],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-2')])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toHaveLength(1)
    expect(r.childrenWithout).toHaveLength(1)
    expect(r.childrenWaiting).toBe(0)
  })

  it('uses a sibling family EARLIEST wave, matching the booking gate', async () => {
    // Year 2 open, Year 5 not. They can book everything already, so they are
    // late rather than early — the same rule stated from the other end.
    prismaMock.consultationEvent.findFirst.mockResolvedValue({
      id: 'ce-1',
      bookingWindows: [
        { yearGroupId: 'yg-2', opensAt: EARLIER },
        { yearGroupId: 'yg-5', opensAt: LATER },
      ],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-1', 'stu-1', 'yg-2', 'Amina'),
      link('p-1', 'stu-2', 'yg-5', 'Yusuf'),
    ])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toHaveLength(1)
    expect(r.families[0].childrenWithout).toEqual(['Amina', 'Yusuf'])
  })

  it('treats a year group with no wave as open, not as never', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue({
      id: 'ce-1', bookingWindows: [{ yearGroupId: 'yg-5', opensAt: LATER }],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-6')])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families).toHaveLength(1)
  })
})

describe('a child with two guardians is ONE child', () => {
  // THE BUG THE FIRST SCHOOL SAW IN A SECOND. 259 of their 276 children have
  // two linked guardians, so counting parent accounts and calling them
  // families reported 399 unbooked at a school with 276 children — a number
  // nobody can check against their own roll, and therefore cannot act on.
  it('counts the child once and names both guardians', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('mum', 'stu-1', 'yg-2', 'Idris'),
      link('dad', 'stu-1', 'yg-2', 'Idris'),
    ])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.childrenWithout).toHaveLength(1)
    expect(r.childrenWithout[0].guardianNames.sort()).toEqual(['Parent dad', 'Parent mum'])
    expect(r.childrenEligible).toBe(1)
    // Both adults are still told — either can book, and reach is the point.
    // The number simply no longer pretends they are two families.
    expect(r.families).toHaveLength(2)
  })

  it('clears BOTH guardians when either one books', async () => {
    // The thing the principal feared: the wife books and the husband is still
    // chased. The booked set is keyed by child, so it cannot happen — asserted
    // rather than argued, because "I read the code and it looks fine" is what
    // was said about three other bugs this week.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('mum', 'stu-1', 'yg-2', 'Idris'),
      link('dad', 'stu-1', 'yg-2', 'Idris'),
    ])
    prismaMock.consultationBooking.findMany.mockResolvedValue([{ studentId: 'stu-1' }])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.childrenWithout).toEqual([])
    expect(r.families).toEqual([])
  })
})

describe('the chasing order', () => {
  it('puts the never-chased first, then the longest since', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-recent', 'stu-1', 'yg-2'),
      link('p-never', 'stu-2', 'yg-2'),
      link('p-old', 'stu-3', 'yg-2'),
    ])
    prismaMock.consultationNudge.findMany.mockResolvedValue([
      { userId: 'p-recent', lastNudgedAt: new Date('2026-10-01T12:00:00Z'), count: 1 },
      { userId: 'p-old', lastNudgedAt: new Date('2026-09-28T12:00:00Z'), count: 2 },
    ])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families.map(f => f.parentId)).toEqual(['p-never', 'p-old', 'p-recent'])
  })

  it('carries how many times each has been asked', async () => {
    // "We have asked this family three times" is a different conversation
    // from "we have asked once".
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'stu-1', 'yg-2')])
    prismaMock.consultationNudge.findMany.mockResolvedValue([
      { userId: 'p-1', lastNudgedAt: new Date('2026-09-28T12:00:00Z'), count: 3 },
    ])

    const r = await unbookedFamilies('ce-1', 'sch-1', NOW)

    expect(r.families[0].nudgeCount).toBe(3)
  })
})

describe('refusing to guess', () => {
  it('returns nothing for a consultation at another school', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue(null)

    const r = await unbookedFamilies('ce-1', 'other-school', NOW)

    expect(r).toEqual({ childrenWithout: [], childrenEligible: 0, childrenWaiting: 0, families: [] })
    expect(prismaMock.parentStudentLink.findMany).not.toHaveBeenCalled()
  })

  it('asks only about children on roll at this school', async () => {
    await unbookedFamilies('ce-1', 'sch-1', NOW)

    const where = prismaMock.parentStudentLink.findMany.mock.calls[0][0].where
    expect(where.student).toEqual({ schoolId: 'sch-1', leftAt: null, isTest: false })
  })
})
