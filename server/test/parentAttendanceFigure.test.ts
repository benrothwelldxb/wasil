import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/attendance/my-children — the school's attendance figure.
 *
 * The figure comes from the school's own MIS via Hub; Connect displays it and
 * calculates nothing. Two things this pins:
 *
 *   • Publishing it is the school's decision, and the toggle gates the RESPONSE.
 *     A school that hasn't chosen it should not have its figures sitting in a
 *     payload a parent can read, however the app happens to render.
 *   • "No figure" is a first-class state, never 0%. A pupil missing from the
 *     MIS export is not a pupil with zero attendance.
 */
const prismaMock = {
  parentStudentLink: { findMany: vi.fn() },
  attendanceRecord: { groupBy: vi.fn(), findMany: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/attendanceReviewNotify', () => ({ notifyAttendanceReviewed: vi.fn() }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))
vi.mock('../src/middleware/auth', () => {
  const asParent = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role: 'PARENT' }
    next()
  }
  return { isAuthenticated: asParent, isAdmin: asParent, isStaff: asParent, loadUserWithRelations: vi.fn() }
})

const { default: attendanceRoutes } = await import('../src/routes/attendance')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/attendance', attendanceRoutes)
  return app
}

const child = (over: Record<string, unknown> = {}) => ({
  student: {
    id: 'stu-1', firstName: 'Amina', lastName: 'Khan',
    class: { name: '3A' },
    attendancePercentage: 94.2,
    attendanceAsOf: '2026-09-01',
    ...over,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentStudentLink.findMany.mockResolvedValue([child()])
  prismaMock.attendanceRecord.groupBy.mockResolvedValue([])
  prismaMock.attendanceRecord.findMany.mockResolvedValue([])
  prismaMock.school.findUnique.mockResolvedValue({ attendanceFigureVisibleToParents: true })
})

describe('GET /api/attendance/my-children', () => {
  it('returns the figure and the date it describes when the school publishes it', async () => {
    const res = await request(makeApp()).get('/api/attendance/my-children')

    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({
      attendancePercentage: 94.2,
      // Never sent without its date: a human uploads the export, so this can be
      // weeks old and a bare percentage implies today.
      attendanceAsOf: '2026-09-01',
    })
  })

  // The gate is here, not only in the app.
  it('withholds it entirely when the school has not turned it on', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ attendanceFigureVisibleToParents: false })

    const res = await request(makeApp()).get('/api/attendance/my-children')

    expect(res.body[0].attendancePercentage).toBeNull()
    expect(res.body[0].attendanceAsOf).toBeNull()
    // The percentage must not appear anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain('94.2')
  })

  // A pupil missing from the MIS export is not a pupil with zero attendance.
  it('a pupil with no figure gets null, not zero', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      child({ attendancePercentage: null, attendanceAsOf: null }),
    ])

    const res = await request(makeApp()).get('/api/attendance/my-children')

    expect(res.body[0].attendancePercentage).toBeNull()
    expect(res.body[0].attendancePercentage).not.toBe(0)
  })

  // 0 is a legitimate figure the MIS can report, and must survive the round trip.
  it('zero is a real figure and is sent as one', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      child({ attendancePercentage: 0, attendanceAsOf: '2026-09-01' }),
    ])

    const res = await request(makeApp()).get('/api/attendance/my-children')

    expect(res.body[0].attendancePercentage).toBe(0)
  })

  it('a parent with no children asks the school nothing', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/attendance/my-children')
    expect(res.body).toEqual([])
    expect(prismaMock.school.findUnique).not.toHaveBeenCalled()
  })
})
