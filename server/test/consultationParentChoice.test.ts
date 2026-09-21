import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Letting a parent choose in person or Google Meet.
 *
 * The Meet plumbing already existed — the school's connected Google Calendar
 * produces a real link on booking. What did not exist was the CHOICE: the mode
 * was fixed per teacher in advance.
 *
 * Two things here are worth more than the happy path.
 *
 * A choice sent for a teacher who does not offer one must be ignored rather
 * than honoured. The picker only shows the choice where it exists, so a choice
 * arriving otherwise is a stale page or a crafted request, and neither should
 * move a meeting online.
 *
 * And a Meet appointment with no link must SAY so. Until now the school having
 * no connected calendar produced a booking with meetingLink null and no word
 * to anyone — a parent with an appointment and no way to attend it, finding
 * out on the evening.
 */

const prismaMock = {
  consultationSlot: { findUnique: vi.fn() },
  consultationBooking: { findFirst: vi.fn(), create: vi.fn() },
  school: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  student: { findFirst: vi.fn() },
  parentStudentLink: { findFirst: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn(), createMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const createGoogleMeetEvent = vi.fn()
vi.mock('../src/services/googleMeet', () => ({
  createGoogleMeetEvent,
  getGoogleAuthUrl: vi.fn(() => 'https://accounts.google.com/x'),
  exchangeGoogleCode: vi.fn(),
  isGoogleCalendarConfigured: vi.fn(() => true),
}))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
// These are fire-and-forget at the call site — the route chains .catch() on
// them — so a mock returning undefined throws where the real one would not.
const resolved = () => vi.fn(async () => undefined)
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmationToParent: resolved(), sendBookingNotificationToTeacher: resolved(),
  sendCancellationToParent: resolved(), sendCancellationToTeacher: resolved(),
}))
vi.mock('../src/services/consultationNotify', () => ({
  sendConsultationBookingNotification: resolved(), sendConsultationCancellationNotification: resolved(),
}))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'p-1', schoolId: 'sch-1', role: 'PARENT', email: 'parent@example.com', name: 'Sadia',
    }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: consultationRoutes } = await import('../src/routes/consultations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/consultations', consultationRoutes)
  return app
}

const book = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/consultations/parent/book').send({
    slotId: 'slot-1', studentId: 'stu-1', studentName: 'Raees', ...body,
  })

const slotWith = (locationType: string) => ({
  id: 'slot-1',
  date: '2026-10-01',
  startTime: '15:30',
  endTime: '15:40',
  isBreak: false,
  booking: null,
  consultationTeacher: {
    id: 'ct-1',
    locationType,
    location: 'Room 3A',
    teacher: { id: 'staff-1', name: 'Ms Khan', email: 'khan@example.com' },
    consultation: { id: 'ev-1', title: "Parents' Evening", status: 'BOOKING_OPEN', date: '2026-10-01', schoolId: 'sch-1' },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationSlot.findUnique.mockResolvedValue(slotWith('PARENT_CHOICE'))
  prismaMock.consultationBooking.findFirst.mockResolvedValue(null)
  prismaMock.consultationBooking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'bk-1', createdAt: new Date('2026-09-21T09:00:00Z'), ...data }))
  prismaMock.school.findUnique.mockResolvedValue({ googleCalendarRefreshToken: 'rt-1', name: 'VHPS' })
  prismaMock.parentStudentLink.findFirst.mockResolvedValue({ studentId: 'stu-1', student: { id: 'stu-1', firstName: 'Raees', lastName: 'Tegally' } })
  prismaMock.parentStudentLink.findMany.mockResolvedValue([{ studentId: 'stu-1', student: { id: 'stu-1', firstName: 'Raees', lastName: 'Tegally' } }])
  prismaMock.notification.create.mockResolvedValue({})
  prismaMock.notification.createMany.mockResolvedValue({ count: 0 })
  prismaMock.notificationPreference.findMany.mockResolvedValue([])
  prismaMock.user.findMany = vi.fn().mockResolvedValue([])
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  createGoogleMeetEvent.mockResolvedValue({ meetLink: 'https://meet.google.com/abc-defg-hij' })
})

describe('POST /parent/book — choosing in person or Meet', () => {
  it('books in person without creating a Meet event', async () => {
    const res = await book({ locationType: 'IN_PERSON' })

    expect(res.status).toBe(201)
    expect(createGoogleMeetEvent).not.toHaveBeenCalled()
    expect(prismaMock.consultationBooking.create.mock.calls[0][0].data.locationType).toBe('IN_PERSON')
    expect(prismaMock.consultationBooking.create.mock.calls[0][0].data.meetingLink).toBeNull()
  })

  it('books on Meet and stores the link', async () => {
    const res = await book({ locationType: 'GOOGLE_MEET' })

    expect(res.status).toBe(201)
    expect(createGoogleMeetEvent).toHaveBeenCalled()
    const data = prismaMock.consultationBooking.create.mock.calls[0][0].data
    expect(data.locationType).toBe('GOOGLE_MEET')
    expect(data.meetingLink).toBe('https://meet.google.com/abc-defg-hij')
    expect(res.body.meetingLinkFailed).toBe(false)
  })

  it('refuses to book when the teacher offers a choice and none was made', async () => {
    const res = await book({})

    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  // A stale page or a crafted request must not move a meeting online.
  it('ignores a choice sent for a teacher who does not offer one', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slotWith('IN_PERSON'))

    const res = await book({ locationType: 'GOOGLE_MEET' })

    expect(res.status).toBe(201)
    expect(createGoogleMeetEvent).not.toHaveBeenCalled()
    // Null, not 'GOOGLE_MEET': the teacher's own setting stands, and the
    // booking records that no choice was taken rather than a false one.
    expect(prismaMock.consultationBooking.create.mock.calls[0][0].data.locationType).toBeNull()
    expect(res.body.locationType).toBe('IN_PERSON')
  })

  it('still creates the link for a teacher fixed to GOOGLE_MEET', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slotWith('GOOGLE_MEET'))

    const res = await book({})

    expect(res.status).toBe(201)
    expect(createGoogleMeetEvent).toHaveBeenCalled()
    expect(res.body.locationType).toBe('GOOGLE_MEET')
  })

  // The silent failure this whole thing was built around.
  it('says so when the school has no connected calendar', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ googleCalendarRefreshToken: null, name: 'VHPS' })

    const res = await book({ locationType: 'GOOGLE_MEET' })

    // The booking stands — the parent holds the slot, and losing it would be
    // the worse outcome — but they are told.
    expect(res.status).toBe(201)
    expect(res.body.meetingLinkFailed).toBe(true)
    expect(prismaMock.consultationBooking.create.mock.calls[0][0].data.meetingLink).toBeNull()
  })

  it('says so when Google refuses the event', async () => {
    createGoogleMeetEvent.mockResolvedValue(null)

    const res = await book({ locationType: 'GOOGLE_MEET' })

    expect(res.status).toBe(201)
    expect(res.body.meetingLinkFailed).toBe(true)
  })
})
