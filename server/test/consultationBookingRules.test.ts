import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * POST /api/consultations/parent/book — who may book what, and how often.
 *
 * The rule is one booking per CHILD per teacher. It used to be one per PARENT
 * per teacher, which got two things wrong in opposite directions: siblings in
 * one class couldn't both be booked, and one child could be booked twice by two
 * different guardians — quietly costing another family a slot.
 *
 * Keying on the child only works if the child is checked, so these cover that
 * too: the id and the name arrived from the request body and were stored
 * unread.
 */
const prismaMock = {
  consultationSlot: { findUnique: vi.fn() },
  consultationBooking: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  child: { findFirst: vi.fn() },
  school: { findUnique: vi.fn() },
  consultationEvent: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmationToParent: vi.fn(),
  sendBookingNotificationToTeacher: vi.fn(),
  sendCancellationToParent: vi.fn(),
  sendCancellationToTeacher: vi.fn(),
}))
vi.mock('../src/services/consultationNotify', () => ({
  sendConsultationBookingNotification: vi.fn(() => Promise.resolve()),
  sendConsultationCancellationNotification: vi.fn(() => Promise.resolve()),
}))
vi.mock('../src/services/googleCalendar', () => ({ createGoogleMeetEvent: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const asParent = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'parent-1', schoolId: 'sch-1', role: 'PARENT', name: 'Sara Khan', email: 'sara@example.com',
    }
    next()
  }
  return { isAuthenticated: asParent, isAdmin: asParent, isStaff: asParent, loadUserWithRelations: vi.fn() }
})

const { default: consultationRoutes } = await import('../src/routes/consultations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/consultations', consultationRoutes)
  return app
}

const slotRow = (over: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  date: '2026-10-14',
  startTime: '15:40',
  endTime: '15:50',
  isBreak: false,
  booking: null,
  consultationTeacherId: 'ct-1',
  consultationTeacher: {
    location: 'Room 3A',
    locationType: 'IN_PERSON',
    teacher: { id: 'staff-1', name: 'Ms Noor', email: 'noor@example.com' },
    consultation: {
      id: 'ce-1', schoolId: 'sch-1', status: 'BOOKING_OPEN', date: '2026-10-14',
      school: { name: 'Victory Heights Primary School' },
    },
  },
  ...over,
})

const book = (body: Record<string, unknown> = {}) =>
  request(makeApp())
    .post('/api/consultations/parent/book')
    .send({ slotId: 'slot-1', studentId: 'stu-amina', studentName: 'Amina Khan', ...body })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationSlot.findUnique.mockResolvedValue(slotRow())
  prismaMock.consultationBooking.findFirst.mockResolvedValue(null)
  prismaMock.consultationBooking.create.mockResolvedValue({ id: 'cb-1', studentName: 'Amina Khan', createdAt: new Date('2026-09-07T10:00:00Z') })
  // Re-read for the response payload.
  prismaMock.consultationBooking.findUnique.mockResolvedValue({
    id: 'cb-1', studentName: 'Amina Khan', createdAt: new Date('2026-09-07T10:00:00Z'), slot: slotRow(),
  })
  prismaMock.parentStudentLink.findFirst.mockResolvedValue({
    student: { firstName: 'Amina', lastName: 'Khan' },
  })
  prismaMock.child.findFirst.mockResolvedValue(null)
  prismaMock.school.findUnique.mockResolvedValue({ googleCalendarRefreshToken: null })
  prismaMock.consultationEvent.findFirst.mockResolvedValue({
    id: 'ce-1', schoolId: 'sch-1', school: { name: 'Victory Heights Primary School' },
  })
})

describe('one booking per child per teacher', () => {
  it('books when the child has no appointment with this teacher', async () => {
    const res = await book()
    expect(res.status).toBe(201)
    expect(prismaMock.consultationBooking.create).toHaveBeenCalled()
  })

  // The rule keys on the child, not on the parent.
  it('checks for an existing booking by child and teacher', async () => {
    await book()
    expect(prismaMock.consultationBooking.findFirst).toHaveBeenCalledWith({
      where: { studentId: 'stu-amina', slot: { consultationTeacherId: 'ct-1' } },
    })
  })

  it('refuses a second appointment for the same child with the same teacher', async () => {
    prismaMock.consultationBooking.findFirst.mockResolvedValue({ id: 'cb-existing' })
    const res = await book()
    expect(res.status).toBe(400)
    // Named, so a parent with several children knows which one is already in.
    expect(res.body.error).toContain('Amina Khan')
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  // Twins, or siblings in one class. The old rule blocked the second one and
  // told the parent to cancel the first — which read as if they'd made a
  // mistake.
  it('lets a parent book a second child with the same teacher', async () => {
    prismaMock.consultationBooking.findFirst.mockImplementation(async ({ where }: any) =>
      where.studentId === 'stu-amina' ? { id: 'cb-existing' } : null,
    )
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({
      student: { firstName: 'Yusuf', lastName: 'Khan' },
    })

    const res = await book({ studentId: 'stu-yusuf' })

    expect(res.status).toBe(201)
    expect(prismaMock.consultationBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studentId: 'stu-yusuf' }) }),
    )
  })

  // The other half: mum books Tuesday, dad books Wednesday, same child, same
  // teacher. Different parents, so the old rule saw nothing wrong.
  it('refuses a second guardian booking the same child with the same teacher', async () => {
    prismaMock.consultationBooking.findFirst.mockResolvedValue({ id: 'cb-by-other-parent' })
    const res = await book()
    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })
})

describe('whose child this is', () => {
  // The id was stored unread. Keying the booking rule on it makes that a way
  // around the rule as well as a way to book against another family's child.
  it('403s on a child who is not this parent’s', async () => {
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
    prismaMock.child.findFirst.mockResolvedValue(null)

    const res = await book({ studentId: 'stu-someone-else' })

    expect(res.status).toBe(403)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  it('accepts a legacy Child id as well as a linked Student id', async () => {
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
    prismaMock.child.findFirst.mockResolvedValue({ name: 'Omar Khan' })

    const res = await book({ studentId: 'child-omar' })

    expect(res.status).toBe(201)
    expect(prismaMock.consultationBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studentName: 'Omar Khan' }) }),
    )
  })

  it('asks which child rather than booking for nobody', async () => {
    const res = await book({ studentId: '' })
    expect(res.status).toBe(400)
    expect(prismaMock.consultationBooking.create).not.toHaveBeenCalled()
  })

  // A teacher's list should read as the school knows the child, not as a parent
  // typed them.
  it('stores the school’s name for the child, not the one in the request', async () => {
    await book({ studentName: 'Princess Sparkles' })
    expect(prismaMock.consultationBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ studentName: 'Amina Khan' }) }),
    )
  })
})

describe('the guards that were already there', () => {
  it('refuses a slot someone else has taken', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slotRow({ booking: { id: 'cb-x' } }))
    const res = await book()
    expect(res.status).toBe(400)
  })

  it('refuses a break', async () => {
    prismaMock.consultationSlot.findUnique.mockResolvedValue(slotRow({ isBreak: true }))
    const res = await book()
    expect(res.status).toBe(400)
  })

  it('refuses when booking is not open', async () => {
    const row = slotRow()
    row.consultationTeacher.consultation.status = 'DRAFT'
    prismaMock.consultationSlot.findUnique.mockResolvedValue(row)
    const res = await book()
    expect(res.status).toBe(400)
  })

  it('refuses a slot in another school', async () => {
    const row = slotRow()
    row.consultationTeacher.consultation.schoolId = 'sch-other'
    prismaMock.consultationSlot.findUnique.mockResolvedValue(row)
    const res = await book()
    expect(res.status).toBe(403)
  })
})
