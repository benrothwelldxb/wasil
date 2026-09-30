import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The activity programme is decided by DATES, never by the registration
 * workflow's status.
 *
 * Those statuses — REGISTRATION_OPEN, REGISTRATION_CLOSED,
 * ALLOCATION_COMPLETE, ACTIVE — belong to a sign-up process that no longer
 * runs in Connect. A school whose families signed up internally, or through
 * Active, leaves its term in DRAFT for ever.
 *
 * At VHPS that hid twenty-seven published activities — correctly scoped, on
 * the right term, with meetings — from every parent in the school. Not because
 * anything was unpublished, but because the side menu asked "has this term
 * reached one of four workflow states" when the question it meant was "is
 * there a programme to show". The page was fine; nobody could reach it.
 *
 * This pins the server half of that: a DRAFT term still yields a programme.
 * The menu now asks this endpoint directly, so the two cannot disagree again.
 */

const prismaMock = {
  ecaTerm: { findFirst: vi.fn(), findMany: vi.fn() },
  ecaActivity: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  ecaSelection: { findMany: vi.fn() },
  ecaInvitation: { findMany: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  student: { findMany: vi.fn() },
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
  loadUserWithRelations: vi.fn(async () => ({ id: 'parent-1', schoolId: 'school-1', studentLinks: [] })),
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
    name: 'Watercolour Art Y4-6',
    description: null,
    category: { name: 'Art' },
    location: 'Studio',
    isCancelled: false,
    cancelReason: null,
    activityType: 'OPEN',
    eligibleGender: null,
    eligibleYearGroupIds: [],
    dayOfWeek: 1,
    customStartTime: '15:30',
    customEndTime: '16:30',
    meetings: [{ dayOfWeek: 1, startTime: '15:30', endTime: '16:30' }],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
  prismaMock.school.findUnique.mockResolvedValue({ activitiesSignUpUrl: null })
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.ecaActivity.findMany.mockResolvedValue([activity()])
})

const programme = () => request(makeApp()).get('/api/eca/parent/programme')

describe('a DRAFT term still has a programme', () => {
  it('returns the term and its activities', async () => {
    // THE VHPS CASE. Signed up internally, so the term never left DRAFT.
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'term-1', name: 'Autumn Term', academicYear: '2026/27', status: 'DRAFT',
      startDate: new Date('2026-08-31'), endDate: new Date('2026-12-11'),
    })

    const res = await programme()

    expect(res.status).toBe(200)
    expect(res.body.term.name).toBe('Autumn Term')
    expect(res.body.days).toHaveLength(1)
    expect(res.body.days[0].activities[0].name).toBe('Watercolour Art Y4-6')
  })

  it('chooses the term by DATE, not by status', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'term-1', name: 'Autumn Term', academicYear: '2026/27', status: 'DRAFT',
      startDate: new Date('2026-08-31'), endDate: new Date('2026-12-11'),
    })

    await programme()

    const where = prismaMock.ecaTerm.findFirst.mock.calls[0][0].where
    expect(where.startDate).toBeDefined()
    expect(where.endDate).toBeDefined()
    // The absence is the point: a status filter here is what made the menu and
    // the page disagree.
    expect(where.status).toBeUndefined()
  })
})

describe('what it still will not show', () => {
  it('asks only for published, active, school-run activities', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'term-1', name: 'Autumn Term', academicYear: '2026/27', status: 'DRAFT',
      startDate: new Date('2026-08-31'), endDate: new Date('2026-12-11'),
    })

    await programme()

    const where = prismaMock.ecaActivity.findMany.mock.calls[0][0].where
    expect(where.isPublished).toBe(true)
    expect(where.isActive).toBe(true)
    // Paid provider clubs are their own page with their own payment; mixing
    // them here would put "sign up at the school's link" beside "pay this
    // provider".
    expect(where.providerId).toBeNull()
  })

  it('says so plainly when there is no term at all', async () => {
    // A real answer, and a different one from "no activities".
    prismaMock.ecaTerm.findFirst.mockResolvedValue(null)

    const res = await programme()

    expect(res.body).toEqual({ term: null, days: [], signUpUrl: null })
  })
})
