import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Which parents see, and are told about, a child's report.
 *
 * Hub lets a school say, per adult and per child, whether that adult receives
 * the child's reports (Hub #258): a separated parent the school sends to, an
 * emergency-only contact it doesn't. Connect mirrors it onto ParentStudentLink.
 * Both halves read it — nobody is told about a report they can't open, and
 * nobody can open one the school didn't mean them to have.
 */

const prismaMock = {
  parentStudentLink: { findMany: vi.fn() },
  studentReport: { findMany: vi.fn() },
  student: { findUnique: vi.fn() },
}
const sendNotification = vi.fn()
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn(), deleteFile: vi.fn(), extractKeyFromUrl: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'par-dad', schoolId: 'school-1', role: 'PARENT', name: 'Omar' }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, isSuperAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { reportAudience, announceReport } = await import('../src/services/studentReportRelease')
const { default: studentRoutes } = await import('../src/routes/students')

beforeEach(() => vi.clearAllMocks())

describe('who is told', () => {
  it('asks only for links the school sends reports to, for a pupil still at this school', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([{ userId: 'par-mum' }])
    const ids = await reportAudience({ studentId: 'stu-maya', schoolId: 'school-1' })

    expect(ids).toEqual(['par-mum'])
    expect(prismaMock.parentStudentLink.findMany.mock.calls[0][0].where).toEqual({
      studentId: 'stu-maya',
      receivesReports: true,
      student: { schoolId: 'school-1', leftAt: null },
    })
  })

  it('announces to exactly that list — an empty one tells nobody, never the whole class', async () => {
    prismaMock.student.findUnique.mockResolvedValue({ firstName: 'Maya' })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    await announceReport({ id: 'r-1', studentId: 'stu-maya', schoolId: 'school-1', title: 'Autumn report', reportPeriod: null }, 'new')

    expect(sendNotification.mock.calls[0][0].target).toEqual({ targetClass: 'Reports', parentUserIds: [], schoolId: 'school-1' })
  })
})

describe('who can see them', () => {
  it('the parent reports page only reads children whose reports go to this parent', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    const app = express()
    app.use(express.json())
    app.use('/api/students', studentRoutes)

    const res = await request(app).get('/api/students/reports/my-children')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(prismaMock.parentStudentLink.findMany.mock.calls[0][0].where).toEqual({ userId: 'par-dad', receivesReports: true })
    expect(prismaMock.studentReport.findMany).not.toHaveBeenCalled()
  })
})
