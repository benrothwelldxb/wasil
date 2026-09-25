import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A saved booking wave has to come back from the list the admin page reads.
 *
 * The times WERE saving. Every time. `PUT /:id/booking-windows` wrote them and
 * the parent side honoured them. But the admin page reads the selected
 * consultation out of `GET /api/consultations` — the LIST — and only
 * `GET /api/consultations/:id` returned `bookingWindows`. So the boxes
 * populated from a field that was never there.
 *
 * Which produced the worst possible shape of bug: blank on load, and blanked
 * AGAIN the instant you saved, because saving refetches that same list. The
 * principal set the times four separate times, watched them vanish, and
 * reasonably concluded the save was broken. Nothing was broken except the
 * reading back — and there is no way to tell those apart from the outside.
 *
 * So the property under test is not "the route includes a field". It is: what
 * you saved is what you are shown.
 */

const prismaMock = {
  consultationEvent: { findMany: vi.fn(), findFirst: vi.fn() },
  consultationBookingWindow: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), notifyParents: vi.fn() }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId: 'sch-1', role: 'ADMIN' }
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

const OPENS = new Date('2026-10-01T14:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ timezone: 'Asia/Dubai' })
  prismaMock.consultationEvent.findMany.mockResolvedValue([
    {
      id: 'ce-1',
      schoolId: 'sch-1',
      title: 'Autumn Consultations',
      date: '2026-10-14',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      teachers: [],
      bookingWindows: [
        { id: 'w-1', yearGroupId: 'yg-2', opensAt: OPENS, yearGroup: { name: 'Year 2' } },
      ],
    },
  ])
})

describe('GET /api/consultations — the list the admin page actually reads', () => {
  it('carries the saved booking windows', async () => {
    const res = await request(makeApp()).get('/api/consultations')

    expect(res.status).toBe(200)
    expect(res.body[0].bookingWindows).toEqual([
      { id: 'w-1', yearGroupId: 'yg-2', yearGroupName: 'Year 2', opensAt: OPENS.toISOString() },
    ])
  })

  it('asks the database for them — the fix is in the query, not the mapping', async () => {
    await request(makeApp()).get('/api/consultations')

    const include = prismaMock.consultationEvent.findMany.mock.calls[0][0].include
    expect(include.bookingWindows).toBeTruthy()
    expect(include.bookingWindows.orderBy).toEqual({ opensAt: 'asc' })
  })

  it('names the year group, so the page can label a row without a second call', async () => {
    const res = await request(makeApp()).get('/api/consultations')
    expect(res.body[0].bookingWindows[0].yearGroupName).toBe('Year 2')
  })

  it('an event with no waves comes back with an empty list, not a missing field', async () => {
    // `undefined` and `[]` read the same in the page's loop but not in its
    // guards — and "no waves set" is a real state a school chooses.
    prismaMock.consultationEvent.findMany.mockResolvedValue([
      { id: 'ce-2', schoolId: 'sch-1', title: 'x', date: '2026-10-14',
        createdAt: new Date(), updatedAt: new Date(), teachers: [], bookingWindows: [] },
    ])

    const res = await request(makeApp()).get('/api/consultations')

    expect(res.body[0].bookingWindows).toEqual([])
  })
})

describe('what you saved is what you are shown', () => {
  it('a window saved through PUT reads back identically from the list', async () => {
    // The round trip, because the two halves were each correct on their own.
    prismaMock.consultationEvent.findFirst.mockResolvedValue({ id: 'ce-1' })
    prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-2' }])
    prismaMock.consultationBookingWindow.findMany.mockResolvedValue([
      { id: 'w-1', yearGroupId: 'yg-2', opensAt: OPENS, yearGroup: { name: 'Year 2', order: 2 } },
    ])

    const saved = await request(makeApp())
      .put('/api/consultations/ce-1/booking-windows')
      .send({ windows: [{ yearGroupId: 'yg-2', opensAt: OPENS.toISOString() }] })

    expect(saved.status).toBe(200)
    expect(saved.body.windows[0].opensAt).toBe(OPENS.toISOString())

    const listed = await request(makeApp()).get('/api/consultations')

    expect(listed.body[0].bookingWindows[0].opensAt).toBe(saved.body.windows[0].opensAt)
    expect(listed.body[0].bookingWindows[0].yearGroupId).toBe('yg-2')
  })
})
