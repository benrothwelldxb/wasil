import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * DELETING A CHILD'S REPORT MUST DELETE THE FILE.
 *
 * This removed the database row and left the object in R2. The key is a random
 * uuid behind a public URL so it is not enumerable, but it stayed fetchable
 * forever by anyone who ever held the link — and deleting the row removed the
 * only record that the file existed.
 *
 * The case that matters is not tidiness. It is a report uploaded against the
 * WRONG CHILD: an admin deletes it, and the wrong parent who already opened it
 * keeps a working link to another family's child indefinitely. The delete is
 * the remedy for a mis-upload, so it is precisely the moment the file must stop
 * existing.
 */
const prismaMock = {
  studentReport: { findFirst: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
}
const storageMock = {
  uploadFile: vi.fn(),
  generateKey: vi.fn(),
  deleteFile: vi.fn(),
  extractKeyFromUrl: (url: string) => {
    try { return new URL(url).pathname.replace(/^\//, '') } catch { return null }
  },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/storage', () => storageMock)
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({ id: 'admin-1', schoolId: 'school-1', studentLinks: [] })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))

const { default: studentRoutes } = await import('../src/routes/students')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/students', studentRoutes)
  return app
}

const del = () => request(makeApp()).delete('/api/students/reports/rep-1')

const REPORT = {
  id: 'rep-1',
  schoolId: 'school-1',
  fileName: 'Maya-T1.pdf',
  fileUrl: 'https://acct.r2.cloudflarestorage.com/report-cards/9f2a-uuid.pdf',
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.studentReport.findFirst.mockResolvedValue(REPORT)
  prismaMock.studentReport.delete.mockResolvedValue({})
  storageMock.deleteFile.mockResolvedValue(undefined)
})

describe('deleting a student report', () => {
  it('removes the stored file, not just the row', async () => {
    const res = await del()

    expect(res.status).toBe(200)
    expect(storageMock.deleteFile).toHaveBeenCalledWith('report-cards/9f2a-uuid.pdf')
    expect(prismaMock.studentReport.delete).toHaveBeenCalledWith({ where: { id: 'rep-1' } })
  })

  it('KEEPS THE ROW when the file cannot be removed', async () => {
    // The ordering is the whole fix. Swallowing this would reproduce the
    // original bug with more steps: pointer gone, file live, nobody any the
    // wiser. Failing leaves the report listed so the delete can be retried.
    storageMock.deleteFile.mockRejectedValue(new Error('r2 unavailable'))

    const res = await del()

    expect(res.status).toBe(500)
    expect(prismaMock.studentReport.delete).not.toHaveBeenCalled()
  })

  it('still deletes a legacy row whose URL is a local path', async () => {
    // Old rows hold "/uploads/report-cards/x.pdf" — no object to remove, which
    // is a completed deletion rather than a failed one.
    prismaMock.studentReport.findFirst.mockResolvedValue({
      ...REPORT, fileUrl: '/uploads/report-cards/old.pdf',
    })

    const res = await del()

    expect(res.status).toBe(200)
    expect(storageMock.deleteFile).not.toHaveBeenCalled()
    expect(prismaMock.studentReport.delete).toHaveBeenCalled()
  })

  it('refuses a report belonging to another school, touching nothing', async () => {
    prismaMock.studentReport.findFirst.mockResolvedValue(null)

    const res = await del()

    expect(res.status).toBe(404)
    expect(storageMock.deleteFile).not.toHaveBeenCalled()
    expect(prismaMock.studentReport.delete).not.toHaveBeenCalled()
  })
})
