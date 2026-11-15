import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * DELETING A STUDENT MUST DELETE THEIR REPORT FILES.
 *
 * StudentReport cascades on Student, so deleting the student dropped the rows
 * and left every PDF in R2 behind a public URL — the #148 defect by another
 * road. Files go first, then rows, then the student; if a file cannot be
 * removed the student stays so the delete can be retried.
 */
const calls: string[] = []
const prismaMock = {
  student: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(async () => { calls.push('student.delete') }),
    deleteMany: vi.fn(async () => { calls.push('student.deleteMany'); return { count: 2 } }),
  },
  studentReport: {
    findMany: vi.fn(),
    delete: vi.fn(async ({ where }: any) => { calls.push(`report.delete:${where.id}`) }),
  },
  parentStudentLink: { deleteMany: vi.fn() },
  studentInvitationLink: { deleteMany: vi.fn() },
  studentGroupLink: { deleteMany: vi.fn() },
  consultationBooking: { deleteMany: vi.fn() },
  serviceRegistration: { deleteMany: vi.fn() },
  conversation: { updateMany: vi.fn() },
}
const storageMock = {
  uploadFile: vi.fn(),
  generateKey: vi.fn(),
  deleteFile: vi.fn(async (key: string) => { calls.push(`file:${key}`) }),
  extractKeyFromUrl: (url: string) => {
    try { return new URL(url).pathname.replace(/^\//, '') } catch { return null }
  },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/storage', () => storageMock)
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { id: 'admin-1', schoolId: 'school-1' }; next() },
  isAdmin: (req: any, _res: any, next: any) => { req.user = { id: 'admin-1', schoolId: 'school-1' }; next() },
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: studentRoutes } = await import('../src/routes/students')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/students', studentRoutes)
  return app
}

const R2 = 'https://acct.r2.cloudflarestorage.com'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1', firstName: 'Maya', lastName: 'T', _count: { parentLinks: 0 } })
  prismaMock.student.findMany.mockResolvedValue([
    { id: 'stu-1', firstName: 'Maya', lastName: 'T' },
    { id: 'stu-2', firstName: 'Sam', lastName: 'K' },
  ])
  prismaMock.studentReport.findMany.mockResolvedValue([
    { id: 'rep-1', fileUrl: `${R2}/report-cards/a.pdf` },
    { id: 'rep-2', fileUrl: '/uploads/report-cards/legacy.pdf' },
  ])
})

describe('deleting a student', () => {
  it('removes each report file, then its row, before the student', async () => {
    const res = await request(makeApp()).delete('/api/students/stu-1')

    expect(res.status).toBe(200)
    expect(prismaMock.studentReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: { in: ['stu-1'] } } }),
    )
    expect(calls).toEqual([
      'file:report-cards/a.pdf',
      'report.delete:rep-1',
      'report.delete:rep-2', // legacy local path: no object, still removed
      'student.delete',
    ])
  })

  it('KEEPS THE STUDENT when a report file cannot be removed', async () => {
    storageMock.deleteFile.mockRejectedValueOnce(new Error('r2 unavailable'))

    const res = await request(makeApp()).delete('/api/students/stu-1')

    expect(res.status).toBe(500)
    expect(prismaMock.studentReport.delete).not.toHaveBeenCalled()
    expect(prismaMock.student.delete).not.toHaveBeenCalled()
  })
})

describe('bulk-deleting students', () => {
  it('removes report files for every student before deleting them', async () => {
    const res = await request(makeApp()).post('/api/students/bulk-delete').send({ ids: ['stu-1', 'stu-2', 'other-school'] })

    expect(res.status).toBe(200)
    expect(prismaMock.studentReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: { in: ['stu-1', 'stu-2'] } } }),
    )
    expect(calls.indexOf('file:report-cards/a.pdf')).toBeLessThan(calls.indexOf('student.deleteMany'))
  })

  it('deletes no students when a file cannot be removed', async () => {
    storageMock.deleteFile.mockRejectedValueOnce(new Error('r2 unavailable'))

    const res = await request(makeApp()).post('/api/students/bulk-delete').send({ ids: ['stu-1', 'stu-2'] })

    expect(res.status).toBe(500)
    expect(prismaMock.student.deleteMany).not.toHaveBeenCalled()
  })
})
