import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The school cancelling a parent's booking.
 *
 * Until now only the parent could cancel their own. So when families booked
 * teachers who do not teach their child — and one parent booked five teachers
 * for one Year 2 child in two hours — the school had no way to free a slot.
 * The only remedy was emailing the parent and asking them to do it.
 *
 * THE REASON IS REQUIRED, and that is the design rather than validation for its
 * own sake. A parent who did not do this and is told only that it happened has
 * the bad half of the news; they ring the office for the other half, which is
 * the call this exists to prevent. There is deliberately no way to cancel
 * silently, because a silent cancellation is a worse version of the problem.
 */

const prismaMock = {
  consultationBooking: { findUnique: vi.fn(), delete: vi.fn() },
  school: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const sendCancellationToParent = vi.fn(async () => undefined)
const sendCancellationToTeacher = vi.fn(async () => undefined)
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmationToParent: vi.fn(async () => undefined),
  sendBookingNotificationToTeacher: vi.fn(async () => undefined),
  sendCancellationToParent,
  sendCancellationToTeacher,
}))
const sendSchoolCancellationNotification = vi.fn(async () => undefined)
vi.mock('../src/services/consultationNotify', () => ({
  sendConsultationBookingNotification: vi.fn(async () => undefined),
  sendConsultationCancellationNotification: vi.fn(async () => undefined),
  sendSchoolCancellationNotification,
}))
const logAudit = vi.fn(async () => undefined)
vi.mock('../src/services/audit', () => ({ logAudit, computeChanges: vi.fn(() => null) }))
const deleteGoogleMeetEvent = vi.fn(async () => undefined)
vi.mock('../src/services/googleMeet', () => ({
  getGoogleAuthUrl: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  createGoogleMeetEvent: vi.fn(async () => undefined),
  deleteGoogleMeetEvent,
  isGoogleCalendarConfigured: vi.fn(() => false),
  GOOGLE_CALENDAR_REDIRECT_URI: 'https://example.test/cb',
}))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'admin-1', schoolId: 'sch-1', role: 'ADMIN', name: 'The Office',
    }
    next()
  }
  return { isAuthenticated: asAdmin, isAdmin: asAdmin, isStaff: asAdmin, loadUserWithRelations: vi.fn() }
})

const { default: consultationRoutes } = await import('../src/routes/consultations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/consultations', consultationRoutes)
  return app
}

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    parentId: 'parent-1',
    slotId: 'slot-1',
    studentName: 'Ean Fundikwa',
    meetingEventId: null,
    meetingLink: null,
    parent: { id: 'parent-1', name: 'Evas Fundikwa', email: 'evas@example.com' },
    slot: {
      date: '2026-10-09',
      startTime: '09:00',
      endTime: '09:20',
      consultationTeacher: {
        location: 'Room 4',
        locationType: 'IN_PERSON',
        teacher: { id: 'teach-1', name: 'Daniel Sanders', email: 'dsanders@school.ae' },
        consultation: { id: 'ce-1', schoolId: 'sch-1', date: '2026-10-09', school: { name: 'VHPS' } },
      },
    },
    ...over,
  }
}

const cancel = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/consultations/bookings/bk-1/cancel').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationBooking.findUnique.mockResolvedValue(booking())
  prismaMock.consultationBooking.delete.mockResolvedValue({})
  prismaMock.school.findUnique.mockResolvedValue({ googleCalendarRefreshToken: null })
})

describe('cancelling, with a reason', () => {
  it('frees the slot and reports it', async () => {
    const res = await cancel({ reason: 'Not your child’s teacher.' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ cancelled: true, slotId: 'slot-1' })
    expect(prismaMock.consultationBooking.delete).toHaveBeenCalledWith({ where: { id: 'bk-1' } })
  })

  it('tells the parent WHY, in the email and in the push', async () => {
    const reason = 'This is not your child’s teacher — please book with Miss Lester.'

    await cancel({ reason })

    expect(sendCancellationToParent).toHaveBeenCalledWith(
      'evas@example.com',
      expect.objectContaining({ reason }),
    )
    expect(sendSchoolCancellationNotification).toHaveBeenCalledWith(
      expect.objectContaining({ reason, parentId: 'parent-1', childName: 'Ean Fundikwa' }),
    )
  })

  it('tells the teacher too — their diary changed without them asking', async () => {
    await cancel({ reason: 'Wrong teacher.' })

    expect(sendCancellationToTeacher).toHaveBeenCalledWith(
      'dsanders@school.ae',
      expect.objectContaining({ parentName: 'Evas Fundikwa' }),
    )
  })

  it('records who did it and why', async () => {
    // Asked weeks later, when a verbal explanation has left no record at all.
    await cancel({ reason: 'Duplicate booking.' })

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        resourceType: 'CONSULTATION_BOOKING',
        resourceId: 'bk-1',
        metadata: expect.objectContaining({ reason: 'Duplicate booking.', teacherName: 'Daniel Sanders' }),
      }),
    )
  })

  it('removes the Google event, so no live joining link survives', async () => {
    prismaMock.consultationBooking.findUnique.mockResolvedValue(booking({ meetingEventId: 'gcal-1' }))
    prismaMock.school.findUnique.mockResolvedValue({ googleCalendarRefreshToken: 'rt' })

    await cancel({ reason: 'Wrong teacher.' })
    await new Promise(r => setImmediate(r))

    expect(deleteGoogleMeetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'gcal-1' }),
    )
  })
})

describe('what it refuses', () => {
  it('refuses with no reason, and cancels nothing', async () => {
    const res = await cancel({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/say why/i)
    expect(prismaMock.consultationBooking.delete).not.toHaveBeenCalled()
  })

  it('refuses a reason that is only whitespace', async () => {
    const res = await cancel({ reason: '   ' })

    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.delete).not.toHaveBeenCalled()
  })

  it('refuses a booking at another school, as a 404 rather than a 403', async () => {
    // Nothing is confirmed to an admin poking at ids from elsewhere.
    prismaMock.consultationBooking.findUnique.mockResolvedValue(
      booking({
        slot: {
          ...booking().slot,
          consultationTeacher: {
            ...booking().slot.consultationTeacher,
            consultation: { id: 'ce-9', schoolId: 'other-school', date: '2026-10-09', school: { name: 'Elsewhere' } },
          },
        },
      }),
    )

    const res = await cancel({ reason: 'Wrong teacher.' })

    expect(res.status).toBe(404)
    expect(prismaMock.consultationBooking.delete).not.toHaveBeenCalled()
  })

  it('does NOT apply the two-hour rule — the school is the party kept waiting', async () => {
    // The parent-facing guard exists to stop a teacher being stood up. The
    // school cancelling an hour before is the school deciding.
    const res = await cancel({ reason: 'Teacher off sick.' })

    expect(res.status).toBe(200)
  })
})
