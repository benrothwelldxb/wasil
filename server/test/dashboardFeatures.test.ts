import { describe, it, expect, vi, beforeEach } from 'vitest'

// The parent dashboard's promo slot. Two rules carry it: a promo only reaches a
// family who could actually take the thing up, and a promo expires on its own.
// Both are here because getting either wrong is worse than not promoting at all.

const prismaMock = {
  schoolService: { findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { featuresForParent } = await import('../src/services/dashboardFeatures')

const SERVICE = {
  id: 'svc-1',
  name: 'Breakfast Club',
  description: 'Supervised morning care from 07:00',
  days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
  startTime: '07:00',
  endTime: '08:00',
  status: 'REGISTRATION_OPEN',
  eligibleClasses: null as string | null,
  eligibleYears: null as string | null,
}
const inClass = (name: string, year: string) => [
  { student: { classId: 'c1', class: { name, yearGroup: { name: year } } } },
]

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.schoolService.findMany.mockResolvedValue([SERVICE])
  prismaMock.parentStudentLink.findMany.mockResolvedValue(inClass('1A', 'Year 1'))
})

describe('featuresForParent — what gets promoted', () => {
  it('returns a card with the schedule collapsed to a range', async () => {
    const [f] = await featuresForParent('parent-1', 'sch-1')
    expect(f).toEqual({
      id: 'svc-1',
      kind: 'SCHOOL_SERVICE',
      title: 'Breakfast Club',
      blurb: 'Supervised morning care from 07:00',
      meta: 'Mon–Fri · 07:00–08:00',
      ctaLabel: 'Sign up',
      href: '/school-services?service=svc-1',
    })
  })

  it('lists non-contiguous days rather than faking a range', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, days: JSON.stringify(['Monday', 'Wednesday', 'Friday']) },
    ])
    const [f] = await featuresForParent('parent-1', 'sch-1')
    expect(f.meta).toBe('Mon, Wed, Fri · 07:00–08:00')
  })

  it('asks to sign up only when registration is actually open', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([{ ...SERVICE, status: 'ACTIVE' }])
    const [f] = await featuresForParent('parent-1', 'sch-1')
    expect(f.ctaLabel).toBe('Find out more')
  })

  it('only queries live services that are flagged and unexpired', async () => {
    await featuresForParent('parent-1', 'sch-1')
    const where = prismaMock.schoolService.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      schoolId: 'sch-1',
      featuredOnDashboard: true,
      // A draft or archived service is never promoted, whatever the flag says.
      status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'ACTIVE'] },
    })
    // Expiry: no end date, or an end date still ahead.
    expect(where.OR).toEqual([
      { featuredUntil: null },
      { featuredUntil: { gte: expect.any(Date) } },
    ])
  })
})

describe('featuresForParent — who sees it', () => {
  it('shows a class-restricted promo to a family in that class', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, eligibleClasses: JSON.stringify(['1A', '1B']) },
    ])
    expect(await featuresForParent('parent-1', 'sch-1')).toHaveLength(1)
  })

  it('hides it from a family in another class', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, eligibleClasses: JSON.stringify(['3C']) },
    ])
    expect(await featuresForParent('parent-1', 'sch-1')).toEqual([])
  })

  it('hides a year-restricted promo from another year group', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, eligibleYears: JSON.stringify(['Year 6']) },
    ])
    expect(await featuresForParent('parent-1', 'sch-1')).toEqual([])
  })

  it('an unrestricted promo reaches everyone, including a parent with no linked child', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    expect(await featuresForParent('parent-1', 'sch-1')).toHaveLength(1)
  })

  it('a restricted promo reaches nobody unplaceable — no child, no eligibility', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, eligibleClasses: JSON.stringify(['1A']) },
    ])
    expect(await featuresForParent('parent-1', 'sch-1')).toEqual([])
  })
})

describe('featuresForParent — resilience', () => {
  it('is empty, never broken, when nothing is promoted', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([])
    expect(await featuresForParent('parent-1', 'sch-1')).toEqual([])
    // No child lookup when there is nothing to place.
    expect(prismaMock.parentStudentLink.findMany).not.toHaveBeenCalled()
  })

  it('swallows a database failure — the dashboard must still render', async () => {
    prismaMock.schoolService.findMany.mockRejectedValue(new Error('db down'))
    expect(await featuresForParent('parent-1', 'sch-1')).toEqual([])
  })

  it('survives malformed JSON in days or eligibility', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([
      { ...SERVICE, days: 'not json', eligibleClasses: '{oops' },
    ])
    const [f] = await featuresForParent('parent-1', 'sch-1')
    expect(f.meta).toBe('07:00–08:00')
  })
})
