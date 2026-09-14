import { describe, it, expect, vi, beforeEach } from 'vitest'

// Audience resolution inside services/notify.ts. Post ADR-0004 modernisation the
// class and year-group branches read the modern Student/ParentStudentLink tables
// (Hub-provisioned pupils), NOT the legacy Child table. Prisma + outbox mocked.

const prismaMock = {
  studentGroupLink: { findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
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
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
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
      // leftAt: null — a pupil who has left is not in the class, so their
      // family is not in the audience.
      where: { classId: 'cls-1', leftAt: null },
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
      where: { schoolId: 'sch-1', class: { yearGroupId: 'yg-1' }, leftAt: null },
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

/**
 * A family who left the school stop being an audience.
 *
 * This is delivery, not a list: without it a child who left in September's
 * parents went on receiving every class and year-group message for the rest of
 * the year — the school's own communications, about a class their child is not
 * in, to a family who have gone.
 */
describe('sendNotification — families who have left', () => {
  const send = (target: Record<string, unknown>) =>
    sendNotification({
      req, type: 'MESSAGE', title: 'T', body: 'B',
      resourceType: 'MESSAGE', resourceId: 'm-1',
      target: { schoolId: 'sch-1', ...target } as any,
    })

  it('excludes leavers from a class audience', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await send({ classId: 'c-1' })

    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({ classId: 'c-1', leftAt: null })
  })

  it('excludes leavers from a year-group audience', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    await send({ yearGroupId: 'yg-1' })

    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1', class: { yearGroupId: 'yg-1' }, leftAt: null,
    })
  })

  // Whole School has no class or year to filter on, so the departed family has
  // to be recognised at the parent level.
  it('drops a whole-school parent whose children have ALL left', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'p-gone' }, { id: 'p-here' }])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { userId: 'p-gone', student: { leftAt: new Date() } },
      { userId: 'p-here', student: { leftAt: new Date() } },
      { userId: 'p-here', student: { leftAt: null } },   // still has one on roll
    ])

    await send({ targetClass: 'Whole School' })

    const notified = prismaMock.notification.createMany.mock.calls[0]?.[0].data.map((d: any) => d.userId)
    expect(notified).toEqual(['p-here'])
  })

  // The narrow rule: no link at all is a LINKING GAP, not a departure, and
  // wrongly silencing a current family is worse than including a departed one.
  it('keeps a whole-school parent who has no linked children at all', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'p-unlinked' }])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])

    await send({ targetClass: 'Whole School' })

    const notified = prismaMock.notification.createMany.mock.calls[0]?.[0].data.map((d: any) => d.userId)
    expect(notified).toEqual(['p-unlinked'])
  })
})
