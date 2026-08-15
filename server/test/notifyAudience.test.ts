import { describe, it, expect, vi, beforeEach } from 'vitest'

// Audience resolution inside services/notify.ts. Post ADR-0004 modernisation the
// class and year-group branches read the modern Student/ParentStudentLink tables
// (Hub-provisioned pupils), NOT the legacy Child table. Prisma + outbox mocked.

const prismaMock = {
  studentGroupLink: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  child: { findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const outboxMock = { enqueuePush: vi.fn(), enqueueEmail: vi.fn() }
vi.mock('../src/services/outbox', () => outboxMock)

const { sendNotification } = await import('../src/services/notify')

const req = {} as any

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.notificationPreference.findMany.mockResolvedValue([])
  prismaMock.notification.createMany.mockResolvedValue({ count: 0 })
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.user.findMany.mockResolvedValue([]) // no inactive parents for the email fallback
  prismaMock.school.findUnique.mockResolvedValue({ name: 'VH Primary' })
})

describe('sendNotification audience resolution (modern Student tables)', () => {
  it('classId → parents of Students in that class (never the legacy Child table)', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { parentLinks: [{ userId: 'p-1' }, { userId: 'p-2' }] },
      { parentLinks: [{ userId: 'p-2' }] }, // dedupes with the row above
    ])
    await sendNotification({
      req, type: 'MESSAGE', title: 'Hi', body: 'Body',
      target: { targetClass: '1A', classId: 'cls-1', schoolId: 'sch-1' },
    })
    // Reads Student, not Child.
    expect(prismaMock.child.findMany).not.toHaveBeenCalled()
    expect(prismaMock.student.findMany).toHaveBeenCalledWith({
      where: { classId: 'cls-1' },
      select: { parentLinks: { select: { userId: true } } },
    })
    // Deduped parent recipients drive the Notification fan-out.
    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId).sort()).toEqual(['p-1', 'p-2'])
  })

  it('yearGroupId → parents of Students in classes of that year group (school-scoped)', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { parentLinks: [{ userId: 'p-9' }] },
    ])
    await sendNotification({
      req, type: 'MESSAGE', title: 'Hi', body: 'Body',
      target: { targetClass: 'Year 1', yearGroupId: 'yg-1', schoolId: 'sch-1' },
    })
    expect(prismaMock.child.findMany).not.toHaveBeenCalled()
    expect(prismaMock.student.findMany).toHaveBeenCalledWith({
      where: { schoolId: 'sch-1', class: { yearGroupId: 'yg-1' } },
      select: { parentLinks: { select: { userId: true } } },
    })
    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual(['p-9'])
  })

  it('no resolved parents → no Notification rows written', async () => {
    prismaMock.student.findMany.mockResolvedValue([{ parentLinks: [] }])
    await sendNotification({
      req, type: 'MESSAGE', title: 'Hi', body: 'Body',
      target: { targetClass: '1A', classId: 'cls-empty', schoolId: 'sch-1' },
    })
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })
})
