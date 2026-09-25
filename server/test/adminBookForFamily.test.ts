import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The school booking a slot for a family.
 *
 * The office takes these by phone and at the gate. Until now the only way to
 * honour one was to tell the parent to do it themselves in the app — which is
 * the request they had just declined to make.
 *
 * THE PARENT IS ALWAYS TOLD. A booking made for somebody who does not know it
 * exists is an empty chair: the teacher waits, the slot is spent, and the
 * family finds out afterwards. There is no quiet mode, deliberately.
 *
 * Two rules are skipped and the difference between them is the interesting
 * part. Booking WAVES are skipped because a wave staggers demand between
 * families and the school is not a family waiting its turn. A teacher who does
 * not teach the child is ALLOWED, and reported rather than refused, because the
 * office books the SENCO and the head of year on purpose — and a rule that
 * cannot tell that from a mistake should not be the one holding the pen.
 *
 * One rule is NOT skipped: one appointment per child per teacher. That is the
 * rule that produced five bookings for a single child, and the office working
 * from a list is more capable of it than a parent, not less.
 */

const prismaMock = {
  consultationSlot: { findUnique: vi.fn() },
  consultationBooking: { findFirst: vi.fn(), create: vi.fn() },
  student: { findFirst: vi.fn() },
  staffClassAssignment: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const sendBookingConfirmationToParent = vi.fn(async () => undefined)
const sendBookingNotificationToTeacher = vi.fn(async () => undefined)
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmationToParent,
  sendBookingNotificationToTeacher,
  sendCancellationToParent: vi.fn(async () => undefined),
  sendCancellationToTeacher: vi.fn(async () => undefined),
}))
const sendConsultationBookingNotification = vi.fn(async () => undefined)
vi.mock('../src/services/consultationNotify', () => ({
  sendConsultationBookingNotification,
  sendConsultationCancellationNotification: vi.fn(async () => undefined),
  sendSchoolCancellationNotification: vi.fn(async () => undefined),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(async () => undefined), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/googleMeet', () => ({
  getGoogleAuthUrl: vi.fn(), exchangeGoogleCode: vi.fn(),
  createGoogleMeetEvent: vi.fn(async () => undefined),
  deleteGoogleMeetEvent: vi.fn(async () => undefined),
  isGoogleCalendarConfigured: vi.fn(() => false),
  GOOGLE_CALENDAR_REDIRECT_URI: 'https://example.test/cb',
}))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
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

function slot(over: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    date: '2026-10-09',
    startTime: '09:00',
    endTime: '09:20',
    isBreak: false,
    booking: null,
    consultationTeacherId: 'ct-1',
    consultationTeacher: {
      location: 'Room 4',
      locationType: 'IN_PERSON',
      teacher: { id: 'teach-1', name: 'Ellie Lester', email: 'elester@school.ae' },
      consultation: { id: 'ce-1', schoolId: 'sch-1', date: '2026-10-09', school: { name: 'VHPS' } },
    },
    ...over,
  }
}

function student(over: Record<string, unknown> = {}) {
  return {
    id: 'stu-1',
    firstName: 'Ean',
    lastName: 'Fundikwa',
    classId: 'cls-2R',
    class: { name: 'Y2 Red' },
    parentLinks: [{ userId: 'parent-1', user: { id: 'parent-1', name: 'Evas Fundikwa', email: 'evas@example.com' } }],
    ...over,
  }
}

const book = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/consultations/slots/slot-1/book').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationSlot.findUnique.mockResolvedValue(slot())
  prismaMock.student.findFirst.mockResolvedValue(student())
  prismaMock.consultationBooking.findFirst.mockResolvedValue(null)
  prismaMock.consultationBooking.create.mockResolvedValue({ id: 'bk-new' })
  prismaMock.staffClassAssignment.findFirst.mockResolvedValue({ id: 'sca-1' })
})

describe('booking on a family behalf', () => {
  it('creates the booking against the child’s linked parent', async () => {
    const res = await book({ studentId: 'stu-1' })

    expect(res.status).toBe(201)
    const data = prismaMock.consultationBooking.create.mock.calls[0][0].data
    expect(data).toMatchObject({ slotId: 'slot-1', parentId: 'parent-1', studentId: 'stu-1', studentName: 'Ean Fundikwa' })
    expect(res.body.parent).toMatchObject({ id: 'parent-1', name: 'Evas Fundikwa' })
  })

  it('TELLS THE PARENT — by email and in the app', async () => {
    // The property the whole feature rests on. A booking nobody knows about is
    // an empty chair with a teacher sitting opposite it.
    await book({ studentId: 'stu-1' })

    expect(sendBookingConfirmationToParent).toHaveBeenCalledWith(
      'evas@example.com',
      expect.objectContaining({ childName: 'Ean Fundikwa', teacherName: 'Ellie Lester' }),
    )
    expect(sendConsultationBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'parent-1', childName: 'Ean Fundikwa' }),
    )
  })

  it('tells the teacher, whose diary just changed', async () => {
    await book({ studentId: 'stu-1' })
    expect(sendBookingNotificationToTeacher).toHaveBeenCalledWith(
      'elester@school.ae',
      expect.objectContaining({ parentName: 'Evas Fundikwa' }),
    )
  })

  it('honours a named guardian where a child has two', async () => {
    // The app shows a booking to the parent who holds it, so the other guardian
    // would not see it at all. Which one is told is a real choice.
    prismaMock.student.findFirst.mockResolvedValue(student({
      parentLinks: [
        { userId: 'parent-1', user: { id: 'parent-1', name: 'Evas', email: 'a@x.com' } },
        { userId: 'parent-2', user: { id: 'parent-2', name: 'Chipo', email: 'b@x.com' } },
      ],
    }))

    const res = await book({ studentId: 'stu-1', parentId: 'parent-2' })

    expect(res.body.parent.id).toBe('parent-2')
    expect(prismaMock.consultationBooking.create.mock.calls[0][0].data.parentId).toBe('parent-2')
  })

  it('reports a teacher who is not the child’s, rather than refusing', async () => {
    // The office books a specialist on purpose. Refusing would make the feature
    // useless for the case it was asked for; saying nothing would make a
    // mis-click indistinguishable from intent.
    prismaMock.staffClassAssignment.findFirst.mockResolvedValue(null)

    const res = await book({ studentId: 'stu-1' })

    expect(res.status).toBe(201)
    expect(res.body.notTheirClassTeacher).toBe(true)
    expect(res.body.className).toBe('Y2 Red')
  })
})

describe('what it still refuses', () => {
  it('a slot that is already booked', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slot({ booking: { id: 'bk-x' } }))
    const res = await book({ studentId: 'stu-1' })
    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  it('a break', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slot({ isBreak: true }))
    expect((await book({ studentId: 'stu-1' })).status).toBe(400)
  })

  it('a second appointment with the same teacher for the same child', async () => {
    // NOT skipped for admins. This is the rule that produced five bookings for
    // one child, and an office working from a list is more capable of it.
    prismaMock.consultationBooking.findFirst.mockResolvedValue({ id: 'bk-existing' })

    const res = await book({ studentId: 'stu-1' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already has an appointment/i)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  it('a child with no linked parent — there would be nobody to tell', async () => {
    prismaMock.student.findFirst.mockResolvedValue(student({ parentLinks: [] }))

    const res = await book({ studentId: 'stu-1' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/nobody to tell/i)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  it('a slot at another school, as a 404', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slot({
      consultationTeacher: { ...slot().consultationTeacher, consultation: { id: 'ce-9', schoolId: 'other', date: '2026-10-09', school: { name: 'Elsewhere' } } },
    }))
    expect((await book({ studentId: 'stu-1' })).status).toBe(404)
  })

  it('gives the slot away to whoever claimed it first', async () => {
    // Same race as a parent booking, same arbiter: the unique on slotId.
    prismaMock.consultationBooking.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    )

    const res = await book({ studentId: 'stu-1' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/just been taken/i)
  })

  it('no child chosen', async () => {
    expect((await book({})).status).toBe(400)
  })
})
