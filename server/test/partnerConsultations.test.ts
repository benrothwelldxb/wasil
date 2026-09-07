import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/partner/consultations — a teacher's own parents' evening list, for
 * Desk to show beside their lessons, duties and cover.
 *
 * Read-only on purpose: two systems able to move the same appointment is how a
 * parent turns up to an empty room. And scoped to the actor — a partner token
 * plus a hub_user_id yields that person's grid, never a school-wide read.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  consultationTeacher: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (t: string) => t }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const TOKEN = 'cpk_secret'
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }

const slot = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-14', startTime: '15:40', endTime: '15:50',
  isBreak: false, booking: null, ...over,
})
const booking = {
  studentName: 'Amina Khan',
  notes: 'Would like to talk about reading.',
  meetingLink: null,
  parent: { name: 'Sara Khan' },
}
const teacherRow = (over: Record<string, unknown> = {}) => ({
  location: 'Room 3A',
  locationType: 'IN_PERSON',
  consultation: { id: 'ce-1', title: "Autumn Parents' Evening", status: 'BOOKING_OPEN' },
  slots: [slot()],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(STAFF)
  prismaMock.consultationTeacher.findMany.mockResolvedValue([teacherRow()])
})

describe('GET /api/partner/consultations', () => {
  it('403 without a resolvable staff actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=ghost'))
    expect(res.status).toBe(403)
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1')
    expect(res.status).toBe(401)
  })

  it('returns the slot in Desk’s vocabulary, times and dates exactly as stored', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
    expect(res.status).toBe(200)
    expect(res.body.slots[0]).toMatchObject({
      event_id: 'ce-1',
      event_title: "Autumn Parents' Evening",
      status: 'BOOKING_OPEN',
      date: '2026-10-14',
      start_time: '15:40',
      end_time: '15:50',
      location: 'Room 3A',
      location_type: 'IN_PERSON',
      is_break: false,
      booked: false,
    })
  })

  // The whole scoping guarantee: a partner token is not a school-wide read.
  it('reads only this teacher’s own rows, in their own school', async () => {
    await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
    expect(prismaMock.consultationTeacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teacherId: 'staff-1', consultation: { schoolId: 'sch-1' } },
      }),
    )
  })

  describe('who is named, and when', () => {
    // The teacher is about to sit down with these people, and the note was
    // written for them to read.
    it('a booked slot carries the child, the parent and the note', async () => {
      prismaMock.consultationTeacher.findMany.mockResolvedValue([
        teacherRow({ slots: [slot({ booking })] }),
      ])
      const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
      expect(res.body.slots[0]).toMatchObject({
        booked: true,
        student_name: 'Amina Khan',
        parent_name: 'Sara Khan',
        notes: 'Would like to talk about reading.',
      })
    })

    // An unbooked slot has nobody to name. Sending nulls invites a screen that
    // renders an empty name where a family should be.
    it('an unbooked slot carries no names at all', async () => {
      const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
      const s = res.body.slots[0]
      expect(s.booked).toBe(false)
      expect(s).not.toHaveProperty('student_name')
      expect(s).not.toHaveProperty('parent_name')
      expect(s).not.toHaveProperty('notes')
    })
  })

  describe('the date window', () => {
    it('filters on both bounds when given', async () => {
      await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1&from=2026-10-01&to=2026-10-31'))
      const arg = prismaMock.consultationTeacher.findMany.mock.calls[0][0]
      expect(arg.include.slots.where).toEqual({ date: { gte: '2026-10-01', lte: '2026-10-31' } })
    })

    // `where: { date: undefined }` drops the filter; `where: { date: null }`
    // would match only slots with no date at all — an empty list dressed as an
    // answer.
    it('drops the filter entirely when neither bound is given', async () => {
      await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
      const arg = prismaMock.consultationTeacher.findMany.mock.calls[0][0]
      expect(arg.include.slots.where).toBeUndefined()
    })

    it('ignores a bound that is not a date rather than filtering on nonsense', async () => {
      await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1&from=october'))
      const arg = prismaMock.consultationTeacher.findMany.mock.calls[0][0]
      expect(arg.include.slots.where).toBeUndefined()
    })
  })

  // A teacher's screen should show the gap they were promised.
  it('includes breaks, flagged', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([
      teacherRow({ slots: [slot({ isBreak: true, startTime: '16:30' })] }),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
    expect(res.body.slots[0].is_break).toBe(true)
  })

  // Each teacher row is sorted on its own, so two events interleave wrongly
  // unless the merged list is sorted again.
  it('sorts across events by date then time', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([
      teacherRow({ slots: [slot({ date: '2026-10-20', startTime: '16:00' })] }),
      teacherRow({ slots: [slot({ date: '2026-10-14', startTime: '17:00' })] }),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/consultations?hub_user_id=hu-1'))
    expect(res.body.slots.map((s: { date: string }) => s.date)).toEqual(['2026-10-14', '2026-10-20'])
  })
})

describe('GET /api/partner/consultations/summary', () => {
  it('counts appointments, not rows — a break is neither booked nor free', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([
      teacherRow({
        slots: [
          slot({ startTime: '15:40', booking }),
          slot({ startTime: '15:50' }),
          slot({ startTime: '16:00', isBreak: true }),
        ],
      }),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/consultations/summary?hub_user_id=hu-1'))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ booked_count: 1, unbooked_count: 1 })
    expect(res.body.next_slot.start_time).toBe('15:40')
  })

  it('403 without a resolvable staff actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/consultations/summary?hub_user_id=ghost'))
    expect(res.status).toBe(403)
  })

  // A teacher with nothing on gets zeroes and a null, not an error.
  it('an empty grid is a real answer', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([])
    const res = await auth(request(makeApp()).get('/api/partner/consultations/summary?hub_user_id=hu-1'))
    expect(res.body).toEqual({ next_slot: null, booked_count: 0, unbooked_count: 0 })
  })
})
