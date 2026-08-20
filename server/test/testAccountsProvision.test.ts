import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Unit tests for the admin-only Test-Account provisioning router. Prisma is
// fully mocked; the auth middleware is replaced with a role-controllable stub so
// we can exercise both the admin happy paths and the non-admin 403s.
const prismaMock = {
  class: { findMany: vi.fn() },
  student: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  parentStudentLink: { upsert: vi.fn() },
  $transaction: vi.fn(),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

// Role-controllable auth stub: `x-test-role` header drives req.user.role and the
// isAdmin gate mirrors the real middleware (ADMIN/SUPER_ADMIN pass, else 403).
vi.mock('../src/middleware/auth', () => {
  const attach = (req: any) => {
    req.user = {
      id: 'admin-1',
      email: 'principal@vhprimarycoa.ae',
      role: (req.headers['x-test-role'] as string) || 'ADMIN',
      schoolId: 'school-1',
    }
  }
  return {
    isAdmin: (req: any, res: any, next: any) => {
      attach(req)
      if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') return next()
      return res.status(403).json({ error: 'Forbidden' })
    },
    isAuthenticated: (req: any, _res: any, next: any) => { attach(req); next() },
    isStaff: (req: any, _res: any, next: any) => { attach(req); next() },
  }
})

const { default: testAccountsRoutes } = await import('../src/routes/testAccounts')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/test-accounts', testAccountsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.TEST_LOGIN_CODE
})
afterEach(() => {
  delete process.env.TEST_LOGIN_CODE
})

describe('POST /api/admin/test-accounts/provision', () => {
  it('creates a Test Student + Test Parent + link for a class (deterministic email + names)', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'c1', name: 'FS1 Blue' }])
    prismaMock.student.findFirst.mockResolvedValue(null)
    prismaMock.student.create.mockResolvedValue({ id: 's1' })
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'p1' })
    prismaMock.parentStudentLink.upsert.mockResolvedValue({})

    const res = await request(makeApp()).post('/api/admin/test-accounts/provision')

    expect(res.status).toBe(200)
    expect(res.body.provisioned).toEqual([
      { classId: 'c1', className: 'FS1 Blue', email: 'test.fs1blue@vhprimarycoa.ae' },
    ])
    expect(res.body.loginCode).toBe('NOT SET')

    // Student created with isTest + the display names.
    const sData = prismaMock.student.create.mock.calls[0][0].data
    expect(sData).toMatchObject({
      firstName: 'Test Student', lastName: '(FS1 Blue)', classId: 'c1', schoolId: 'school-1', isTest: true,
    })
    // Parent created with isTest, PARENT role, and the derived email/name.
    const uData = prismaMock.user.create.mock.calls[0][0].data
    expect(uData).toMatchObject({
      email: 'test.fs1blue@vhprimarycoa.ae', name: 'Test Parent (FS1 Blue)', role: 'PARENT', schoolId: 'school-1', isTest: true,
    })
    expect(prismaMock.parentStudentLink.upsert).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a second run with existing rows creates no duplicates', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'c1', name: 'FS1 Blue' }])
    prismaMock.student.findFirst.mockResolvedValue({ id: 's1' }) // already exists
    prismaMock.user.findUnique.mockResolvedValue({ id: 'p1' })    // already exists
    prismaMock.parentStudentLink.upsert.mockResolvedValue({})

    const res = await request(makeApp()).post('/api/admin/test-accounts/provision')

    expect(res.status).toBe(200)
    expect(res.body.provisioned).toHaveLength(1)
    expect(prismaMock.student.create).not.toHaveBeenCalled()
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    // The link is still ensured (upsert is a no-op when present).
    expect(prismaMock.parentStudentLink.upsert).toHaveBeenCalledTimes(1)
  })

  it('reports loginCode "set" without echoing the code value', async () => {
    process.env.TEST_LOGIN_CODE = 'SECRET-CODE-XYZ'
    prismaMock.class.findMany.mockResolvedValue([])

    const res = await request(makeApp()).post('/api/admin/test-accounts/provision')

    expect(res.status).toBe(200)
    expect(res.body.loginCode).toBe('set')
    expect(JSON.stringify(res.body)).not.toContain('SECRET-CODE-XYZ')
  })

  it('rejects non-admins with 403', async () => {
    const res = await request(makeApp())
      .post('/api/admin/test-accounts/provision')
      .set('x-test-role', 'PARENT')
    expect(res.status).toBe(403)
    expect(prismaMock.class.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/test-accounts', () => {
  it('lists test parents with class + student name', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        email: 'test.fs1blue@vhprimarycoa.ae',
        studentLinks: [
          { student: { firstName: 'Test', lastName: 'Student (FS1 Blue)', isTest: true, class: { id: 'c1', name: 'FS1 Blue' } } },
        ],
      },
    ])

    const res = await request(makeApp()).get('/api/admin/test-accounts')

    expect(res.status).toBe(200)
    expect(res.body.testAccounts).toEqual([
      { classId: 'c1', className: 'FS1 Blue', email: 'test.fs1blue@vhprimarycoa.ae', studentName: 'Test Student (FS1 Blue)' },
    ])
    // The query must be scoped to isTest parents in the school.
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toMatchObject({
      schoolId: 'school-1', role: 'PARENT', isTest: true,
    })
  })

  it('rejects non-admins with 403', async () => {
    const res = await request(makeApp()).get('/api/admin/test-accounts').set('x-test-role', 'STAFF')
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/admin/test-accounts', () => {
  it('removes all test parents + students and reports counts', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p1', email: 'test.fs1blue@vhprimarycoa.ae' }])
    prismaMock.student.findMany.mockResolvedValue([{ id: 's1' }])

    // tx stub — every write returns a count; conversation.findMany returns [].
    const txDelete = vi.fn().mockResolvedValue({ count: 0 })
    const tx = {
      conversation: { findMany: vi.fn().mockResolvedValue([]), deleteMany: txDelete },
      conversationMessage: { deleteMany: txDelete },
      conversationParticipant: { deleteMany: txDelete },
      messageReaction: { deleteMany: txDelete },
      attendanceRequest: { deleteMany: txDelete },
      serviceRegistration: { deleteMany: txDelete },
      consultationBooking: { deleteMany: txDelete },
      alertAcknowledgment: { deleteMany: txDelete },
      alertDelivery: { deleteMany: txDelete },
      studentInvitationLink: { deleteMany: txDelete },
      parentStudentLink: { deleteMany: txDelete },
      loginCode: { deleteMany: txDelete },
      student: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx))

    const res = await request(makeApp()).delete('/api/admin/test-accounts')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ removedParents: 1, removedStudents: 1 })
    expect(tx.student.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] } } })
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } } })
  })

  it('is a no-op when there are no test accounts', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.student.findMany.mockResolvedValue([])

    const res = await request(makeApp()).delete('/api/admin/test-accounts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ removedParents: 0, removedStudents: 0 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects non-admins with 403', async () => {
    const res = await request(makeApp()).delete('/api/admin/test-accounts').set('x-test-role', 'PARENT')
    expect(res.status).toBe(403)
  })
})
