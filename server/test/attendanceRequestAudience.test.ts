import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// A parent-submitted absence request must reach the SCHOOL OFFICE and nobody
// else. It previously called sendNotification({ targetClass: 'Whole School' }),
// and that function resolves to every PARENT in the school — so one family's
// absence, naming the parent and the child, was pushed to the entire parent
// body. These tests pin the audience so that can't return.

const prismaMock = {
  parentStudentLink: { findFirst: vi.fn() },
  attendanceRequest: { create: vi.fn() },
  user: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const outboxMock = { enqueuePush: vi.fn(), enqueueEmail: vi.fn() }
vi.mock('../src/services/outbox', () => outboxMock)

const PARENT = { id: 'parent-1', role: 'PARENT', schoolId: 'sch-1', name: 'Mrs Koy' }
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = PARENT
    next()
  }
  return { isAuthenticated: setUser, isStaff: setUser, isAdmin: setUser, loadUserWithRelations: vi.fn(async () => PARENT) }
})
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: attendanceRoutes } = await import('../src/routes/attendance')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/attendance', attendanceRoutes)
  return app
}

const submit = () =>
  request(makeApp()).post('/api/attendance/request').send({
    studentId: 'stu-1', type: 'ABSENCE', startDate: '2026-08-26', reason: 'illness',
  })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentStudentLink.findFirst.mockResolvedValue({
    student: { firstName: 'Ada', lastName: 'Koy', class: { name: '1A' } },
  })
  prismaMock.attendanceRequest.create.mockResolvedValue({
    id: 'ar-1', studentId: 'stu-1', parentId: 'parent-1', type: 'ABSENCE',
    startDate: '2026-08-26', endDate: null, reason: 'illness', notes: null, time: null,
    status: 'PENDING', createdAt: new Date('2026-08-26T08:00:00.000Z'),
    student: { firstName: 'Ada', lastName: 'Koy', class: { name: '1A' } },
    parent: { name: 'Mrs Koy' },
  })
  prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }])
  prismaMock.notification.createMany.mockResolvedValue({ count: 2 })
  prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-admin' }])
  outboxMock.enqueuePush.mockResolvedValue(undefined)
})

describe('POST /api/attendance/requests — who gets told', () => {
  it('queries ONLY staff roles in the submitting parent’s school', async () => {
    const res = await submit()
    expect(res.status).toBe(200)

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1',
      role: { in: ['ADMIN', 'SUPER_ADMIN'] },
    })
  })

  it('never creates a notification for a parent', async () => {
    await submit()
    const recipients = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(recipients.map((n: { userId: string }) => n.userId)).toEqual(['admin-1', 'admin-2'])
    expect(recipients.some((n: { userId: string }) => n.userId === 'parent-1')).toBe(false)
  })

  it('pushes only to staff devices', async () => {
    await submit()
    expect(prismaMock.deviceToken.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: ['admin-1', 'admin-2'] },
    })
    expect(outboxMock.enqueuePush.mock.calls[0][1].tokens).toEqual(['tok-admin'])
  })

  it('the notification body still names the pupil — which is why the audience matters', async () => {
    await submit()
    const first = prismaMock.notification.createMany.mock.calls[0][0].data[0]
    expect(first.body).toContain('Ada Koy')
    expect(first.type).toBe('ATTENDANCE_REQUEST')
    expect(first.resourceId).toBe('ar-1')
  })

  it('a school with no admins simply notifies nobody (never falls back to parents)', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    const res = await submit()
    expect(res.status).toBe(200)
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
    expect(outboxMock.enqueuePush).not.toHaveBeenCalled()
  })
})
