import { describe, it, expect, vi, beforeEach } from 'vitest'

// Telling a parent their absence request was decided. The audience here is ONE
// person — the parent who submitted it. This file exists because the same page
// of the codebase previously shipped a "notify the office" that resolved to
// every parent in the school; these tests make the recipient impossible to widen
// by accident.

const prismaMock = {
  notification: { create: vi.fn(), createMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const outboxMock = { enqueuePush: vi.fn(), enqueueEmail: vi.fn() }
vi.mock('../src/services/outbox', () => outboxMock)

const { notifyAttendanceReviewed } = await import('../src/services/attendanceReviewNotify')

const NOTICE = {
  requestId: 'ar-1',
  schoolId: 'sch-1',
  parentId: 'parent-1',
  studentName: 'Ada Koy',
  type: 'ABSENCE',
  startDate: '2026-08-31',
  endDate: null,
  status: 'APPROVED' as const,
  reviewNotes: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.notification.create.mockResolvedValue({})
  prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-parent' }])
  prismaMock.user.findUnique.mockResolvedValue({ email: 'mum@example.com', name: 'Mrs Koy' })
  prismaMock.school.findUnique.mockResolvedValue({ name: 'VH Primary' })
})

describe('notifyAttendanceReviewed — audience', () => {
  it('creates exactly ONE in-app notification, for the submitting parent', async () => {
    await notifyAttendanceReviewed(NOTICE)

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.notification.create.mock.calls[0][0].data).toMatchObject({
      userId: 'parent-1',
      type: 'ATTENDANCE_REQUEST',
      resourceId: 'ar-1',
      schoolId: 'sch-1',
    })
    // The bulk path is how the school-wide leak happened. It must stay unused.
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })

  it('pushes only to that parent’s own devices', async () => {
    await notifyAttendanceReviewed(NOTICE)

    expect(prismaMock.deviceToken.findMany.mock.calls[0][0].where).toEqual({ userId: 'parent-1' })
    expect(outboxMock.enqueuePush).toHaveBeenCalledTimes(1)
    expect(outboxMock.enqueuePush.mock.calls[0][1].tokens).toEqual(['tok-parent'])
  })

  it('emails only that parent’s address', async () => {
    await notifyAttendanceReviewed(NOTICE)

    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'parent-1' })
    expect(outboxMock.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(outboxMock.enqueueEmail.mock.calls[0][1].to).toBe('mum@example.com')
  })

  it('never looks up an audience — no school-wide or class-wide user query', async () => {
    await notifyAttendanceReviewed(NOTICE)
    // A recipient SET could only come from findMany; the only one used is the
    // device-token lookup, already asserted to be scoped to this parent.
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })
})

describe('notifyAttendanceReviewed — content', () => {
  it('says approved, names the child and the date', async () => {
    await notifyAttendanceReviewed(NOTICE)
    const { title, body } = prismaMock.notification.create.mock.calls[0][0].data
    expect(title).toBe('Absence request approved')
    expect(body).toContain('Ada Koy')
    expect(body).toContain('31 Aug 2026')
    expect(body).toContain('approved')
  })

  it('says declined, and carries the reviewer’s note verbatim', async () => {
    await notifyAttendanceReviewed({
      ...NOTICE,
      status: 'DECLINED',
      reviewNotes: 'Please provide a medical note.',
    })
    const { title, body } = prismaMock.notification.create.mock.calls[0][0].data
    expect(title).toBe('Absence request declined')
    expect(body).toContain('declined')
    expect(body).toContain('Please provide a medical note.')

    const email = outboxMock.enqueueEmail.mock.calls[0][1]
    expect(email.subject).toBe('[VH Primary] Absence request declined')
    expect(email.html).toContain('We have reviewed')
    expect(email.html).toContain('Please provide a medical note.')
    expect(email.text).toContain('Please provide a medical note.')
  })

  it('reads a multi-day request as a range', async () => {
    await notifyAttendanceReviewed({ ...NOTICE, startDate: '2026-08-31', endDate: '2026-09-02' })
    const body = prismaMock.notification.create.mock.calls[0][0].data.body
    // Asserted in parts: the month abbreviation ("Sep" vs "Sept") is ICU's to
    // decide and shifts with the Node build.
    expect(body).toMatch(/31 Aug\s+–\s+2 Sept? 2026/)
  })

  it('escapes reviewer text in the HTML email', async () => {
    await notifyAttendanceReviewed({ ...NOTICE, reviewNotes: '<script>alert(1)</script>' })
    const html = outboxMock.enqueueEmail.mock.calls[0][1].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('names the request type it actually was', async () => {
    await notifyAttendanceReviewed({ ...NOTICE, type: 'EARLY_PICKUP' })
    expect(prismaMock.notification.create.mock.calls[0][0].data.body).toContain('early pickup')
  })
})

describe('notifyAttendanceReviewed — resilience', () => {
  it('never throws: the decision is already saved, so telling must not undo it', async () => {
    prismaMock.notification.create.mockRejectedValue(new Error('db down'))
    await expect(notifyAttendanceReviewed(NOTICE)).resolves.toBeUndefined()
  })

  it('sends in-app and push even when the parent has no email on file', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: null, name: 'Mrs Koy' })
    await notifyAttendanceReviewed(NOTICE)
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1)
    expect(outboxMock.enqueuePush).toHaveBeenCalledTimes(1)
    expect(outboxMock.enqueueEmail).not.toHaveBeenCalled()
  })

  it('skips push cleanly when the parent has no registered device', async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([])
    await notifyAttendanceReviewed(NOTICE)
    expect(outboxMock.enqueuePush).not.toHaveBeenCalled()
    expect(outboxMock.enqueueEmail).toHaveBeenCalledTimes(1)
  })
})
