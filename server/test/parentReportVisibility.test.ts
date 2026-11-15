import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

/** A scheduled report does not exist for parents until its publishAt (CP-1). */
const prismaMock = {
  parentStudentLink: { findMany: vi.fn(async () => [{ studentId: 'stu-maya' }]) },
  studentReport: { findMany: vi.fn(async () => []) },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn(), deleteFile: vi.fn(), extractKeyFromUrl: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn() }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => { req.user = { id: 'parent-1', schoolId: 'school-1' }; next() },
  isAdmin: (_req: any, res: any) => res.status(403).end(),
}))

const { default: studentRoutes } = await import('../src/routes/students')

describe("a parent's reports list", () => {
  it('leaves out reports scheduled for later', async () => {
    const app = express()
    app.use('/api/students', studentRoutes)
    const res = await request(app).get('/api/students/reports/my-children')
    expect(res.status).toBe(200)
    const where = prismaMock.studentReport.findMany.mock.calls[0][0].where
    expect(where.studentId).toEqual({ in: ['stu-maya'] })
    expect(where.OR).toEqual([{ publishAt: null }, { publishAt: { lte: expect.any(Date) } }])
  })
})
