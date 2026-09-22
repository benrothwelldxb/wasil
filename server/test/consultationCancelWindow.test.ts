import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * "Two hours before the appointment" means two hours before it starts HERE.
 *
 * A consultation slot is a wall clock and nothing else: a date string and
 * "15:30", with no zone anywhere on it, because that is what a school means by
 * an appointment time. `new Date("2026-09-25T15:30:00")` reads that string in
 * the SERVER's zone — UTC in production — so at a UTC+4 school every
 * appointment resolved four hours later than it happens, and the cancellation
 * lock moved with it. A parent could still cancel two hours AFTER the teacher
 * had sat down to wait for them.
 *
 * The bug was invisible in development, where the machine is already on Gulf
 * time and the two readings agree.
 */

const prismaMock = {
  consultationBooking: { findUnique: vi.fn(), delete: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
// Cancellation emails, notifications and the Google event delete are all
// fire-and-forget — the route calls `.catch()` on what they return without
// awaiting, so a mock returning undefined throws inside the route rather than
// in the test, and surfaces as a 500 that looks like the guard misfiring.
const resolves = () => vi.fn(async () => undefined)
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmation: resolves(),
  sendCancellationToTeacher: resolves(),
  sendReminderToParent: resolves(),
}))
vi.mock('../src/services/consultationNotify', () => ({
  sendBookingNotification: resolves(),
  sendCancellationNotification: resolves(),
  sendConsultationCancellationNotification: resolves(),
  sendConsultationReminderNotification: resolves(),
}))
vi.mock('../src/services/googleCalendar', () => ({ createGoogleMeetEvent: resolves() }))
vi.mock('../src/services/googleMeet', () => ({
  createGoogleMeetEvent: resolves(),
  deleteGoogleMeetEvent: resolves(),
  isGoogleCalendarConfigured: vi.fn(() => false),
}))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'parent-1', schoolId: 'sch-1', role: 'PARENT', preferredLanguage: 'en',
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

/** A booking for a 15:30 slot on 25 Sep — 11:30 UTC at a UTC+4 school. */
function booking() {
  return {
    id: 'bk-1',
    parentId: 'parent-1',
    meetingEventId: null,
    slot: {
      date: '2026-09-25',
      startTime: '15:30',
      endTime: '15:40',
      consultationTeacher: {
        teacher: { id: 't-1', name: 'Ms Teacher', email: 't@school.ae' },
        consultation: { id: 'ce-1', status: 'BOOKING_OPEN', date: '2026-09-25', school: { name: 'VHPS' } },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationBooking.findUnique.mockResolvedValue(booking())
  prismaMock.consultationBooking.delete.mockResolvedValue({})
  prismaMock.school.findUnique.mockResolvedValue({ timezone: 'Asia/Dubai' })
})

afterEach(() => {
  vi.useRealTimers()
})

const cancel = () => request(makeApp()).delete('/api/consultations/parent/bookings/bk-1')

describe('cancelling within two hours, at a UTC+4 school', () => {
  it('refuses at 14:00 school time — 90 minutes before a 15:30 appointment', async () => {
    // 10:00 UTC is 14:00 in Dubai. Read as UTC the appointment looks like
    // 15:30 UTC, five and a half hours away, and the cancellation went through.
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'))

    const res = await cancel()

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/less than 2 hours away/)
    expect(prismaMock.consultationBooking.delete).not.toHaveBeenCalled()
  })

  it('refuses after it has already started', async () => {
    // 16:00 in Dubai: the parent is half an hour late, not early.
    vi.setSystemTime(new Date('2026-09-25T12:00:00.000Z'))

    const res = await cancel()

    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.delete).not.toHaveBeenCalled()
  })

  it('allows it the morning of, well outside the window', async () => {
    // 09:00 in Dubai — six and a half hours to go.
    vi.setSystemTime(new Date('2026-09-25T05:00:00.000Z'))

    const res = await cancel()

    expect(res.status).toBe(200)
    expect(prismaMock.consultationBooking.delete).toHaveBeenCalledWith({ where: { id: 'bk-1' } })
  })

  it('reads the slot against the school zone, not the server zone', async () => {
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'))
    await cancel()
    expect(prismaMock.school.findUnique).toHaveBeenCalledWith({
      where: { id: 'sch-1' },
      select: { timezone: true },
    })
  })
})

describe('a school that is actually on UTC', () => {
  it('still gets a two-hour window measured in its own time', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ timezone: 'UTC' })
    // 14:00 UTC, 90 minutes before a 15:30 UTC appointment.
    vi.setSystemTime(new Date('2026-09-25T14:00:00.000Z'))

    expect((await cancel()).status).toBe(400)
  })

  it('and can still cancel earlier in the day', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ timezone: 'UTC' })
    vi.setSystemTime(new Date('2026-09-25T09:00:00.000Z'))

    expect((await cancel()).status).toBe(200)
  })
})
