import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/eca/parent/programme — the school's activity programme, read-only.
 *
 * The failures worth guarding are the ones that render as ordinary states:
 * "no term running" collapsing into "no clubs", a twice-weekly club appearing
 * once, an activity with no meeting row vanishing, and a boys-only club being
 * hidden rather than labelled.
 */
const prismaMock = {
  parentStudentLink: { findFirst: vi.fn() },
  ecaTerm: { findFirst: vi.fn() },
  ecaActivity: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/ecaAllocation', () => ({ runAllocation: vi.fn(), previewAllocation: vi.fn() }))
vi.mock('../src/services/ecaPdf', () => ({ buildAllocationPdf: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const asParent = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'sch-1', role: 'PARENT' }
    next()
  }
  return {
    isAuthenticated: asParent,
    isAdmin: asParent,
    isStaff: asParent,
    loadUserWithRelations: vi.fn(async () => ({ id: 'parent-1', schoolId: 'sch-1', role: 'PARENT' })),
  }
})

const { default: ecaRoutes } = await import('../src/routes/eca')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/eca', ecaRoutes)
  return app
}

const TERM = {
  id: 'term-1', name: 'Autumn Term', academicYear: '2026/27',
  startDate: new Date('2026-09-08'), endDate: new Date('2026-12-11'),
}

const activity = (over: Record<string, unknown> = {}) => ({
  id: 'act-1',
  name: 'Football',
  description: 'Games and skills for beginners.',
  category: { name: 'Sports' },
  location: 'Field',
  isCancelled: false,
  cancelReason: null,
  activityType: 'OPEN',
  eligibleGender: 'MIXED',
  eligibleYearGroupIds: ['yg-3'],
  dayOfWeek: 1,
  customStartTime: '15:30',
  customEndTime: '16:30',
  meetings: [{ dayOfWeek: 1, startTime: '15:30', endTime: '16:30' }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentStudentLink.findFirst.mockResolvedValue({
    student: { id: 'stu-1', class: { yearGroupId: 'yg-3' } },
  })
  prismaMock.ecaTerm.findFirst.mockResolvedValue(TERM)
  prismaMock.ecaActivity.findMany.mockResolvedValue([activity()])
  prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-3', name: 'Year 3', order: 3 }])
  prismaMock.school.findUnique.mockResolvedValue({ activitiesSignUpUrl: 'https://active.example/signup' })
})

const get = (q = '?studentId=stu-1') => request(makeApp()).get(`/api/eca/parent/programme${q}`)

describe('GET /api/eca/parent/programme', () => {
  it('returns the term, the day and the activity on it', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.term).toMatchObject({ name: 'Autumn Term', academicYear: '2026/27' })
    expect(res.body.days).toHaveLength(1)
    expect(res.body.days[0]).toMatchObject({ dayOfWeek: 1 })
    expect(res.body.days[0].activities[0]).toMatchObject({
      name: 'Football', location: 'Field', categoryName: 'Sports',
      startTime: '15:30', endTime: '16:30', yearGroupNames: ['Year 3'],
    })
    expect(res.body.signUpUrl).toBe('https://active.example/signup')
  })

  // The whole reason the day-grouped layout exists.
  it('a club meeting twice appears on both days', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({
        meetings: [
          { dayOfWeek: 1, startTime: '15:30', endTime: '16:30' },
          { dayOfWeek: 3, startTime: '15:30', endTime: '16:30' },
        ],
      }),
    ])
    const res = await get()
    expect(res.body.days.map((d: { dayOfWeek: number }) => d.dayOfWeek)).toEqual([1, 3])
    expect(res.body.days[0].activities[0].name).toBe('Football')
    expect(res.body.days[1].activities[0].name).toBe('Football')
  })

  // An activity created in Connect before meetings existed has no meeting row.
  // Falling through would delete it from the screen.
  it('an activity with no meeting row still appears, on its legacy day', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      activity({ meetings: [], dayOfWeek: 2, customStartTime: '07:30', customEndTime: '08:15' }),
    ])
    const res = await get()
    expect(res.body.days).toHaveLength(1)
    expect(res.body.days[0]).toMatchObject({ dayOfWeek: 2 })
    expect(res.body.days[0].activities[0]).toMatchObject({ startTime: '07:30', endTime: '08:15' })
  })

  describe('states that must not collapse into each other', () => {
    // "No term is running" and "the term has no clubs" are different answers
    // and a parent should be told which.
    it('no term running returns term:null, not an empty programme', async () => {
      prismaMock.ecaTerm.findFirst.mockResolvedValue(null)
      const res = await get()
      expect(res.body.term).toBeNull()
      expect(res.body.days).toEqual([])
      // The sign-up link still comes back: the school's route to joining
      // doesn't disappear because Connect has no term row.
      expect(res.body.signUpUrl).toBe('https://active.example/signup')
    })

    it('a term with nothing published returns the term and no days', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([])
      const res = await get()
      expect(res.body.term).not.toBeNull()
      expect(res.body.days).toEqual([])
    })
  })

  describe('eligibility', () => {
    it('hides an activity restricted to another year group', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ eligibleYearGroupIds: ['yg-9'] })])
      const res = await get()
      expect(res.body.days).toEqual([])
    })

    // Empty means anyone may come, not nobody may.
    it('an activity with no year groups is open to all', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ eligibleYearGroupIds: [] })])
      const res = await get()
      expect(res.body.days[0].activities[0].yearGroupNames).toEqual([])
    })

    // Written as a stringified array by the admin path, as a real array by the
    // partner push.
    it('reads year groups stored as a JSON string as well as an array', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ eligibleYearGroupIds: '["yg-3"]' })])
      const res = await get()
      expect(res.body.days[0].activities[0].yearGroupNames).toEqual(['Year 3'])
    })

    // Connect doesn't hold pupil gender, so a boys-only club is labelled, never
    // filtered — hiding it from half the school on a field we don't have would
    // be worse than showing a restriction a parent can read.
    it('labels a gender restriction rather than filtering on it', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ eligibleGender: 'BOYS_ONLY' })])
      const res = await get()
      expect(res.body.days[0].activities[0].eligibleGender).toBe('BOYS_ONLY')
    })

    // A studentId that isn't this parent's child must read as no child, never
    // as someone else's.
    it('shows the whole programme when the studentId is not this parent’s', async () => {
      prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ eligibleYearGroupIds: ['yg-9'] })])
      prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-9', name: 'Year 9', order: 9 }])
      const res = await get('?studentId=someone-elses-child')
      expect(res.body.days).toHaveLength(1)
    })
  })

  describe('what a parent must still be able to see', () => {
    // A parent who saw it last week needs to find it and read why, not
    // discover it missing.
    it('a cancelled activity is still listed, and says so', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([
        activity({ isCancelled: true, cancelReason: 'Coach unavailable' }),
      ])
      const res = await get()
      expect(res.body.days[0].activities[0]).toMatchObject({
        isCancelled: true, cancelReason: 'Coach unavailable',
      })
    })

    it('marks an invitation-only squad as one', async () => {
      prismaMock.ecaActivity.findMany.mockResolvedValue([activity({ activityType: 'INVITE_ONLY' })])
      const res = await get()
      expect(res.body.days[0].activities[0].inviteOnly).toBe(true)
    })
  })

  // Paid provider clubs are their own page with their own booking and payment.
  it('asks only for school-run activities', async () => {
    await get()
    expect(prismaMock.ecaActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerId: null, isPublished: true, isActive: true }),
      }),
    )
  })
})
