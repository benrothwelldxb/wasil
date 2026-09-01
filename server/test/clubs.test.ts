import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  ecaActivity: { findFirst: vi.fn(), findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  ecaProviderBooking: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: { id: string; schoolId: string } }).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({
    id: 'parent-1',
    schoolId: 'school-1',
    studentLinks: [
      { studentId: 'stu-1', student: { firstName: 'Kid', lastName: 'One', class: { name: '3A', yearGroupId: 'yg-3' } } },
      { studentId: 'stu-2', student: { firstName: 'Kid', lastName: 'Two', class: { name: '6B', yearGroupId: 'yg-6' } } },
    ],
  })),
}))

const { default: clubsRoutes } = await import('../src/routes/clubs')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/clubs', clubsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.yearGroup.findMany.mockResolvedValue([
    { id: 'yg-3', name: 'Year 3', order: 3 },
    { id: 'yg-6', name: 'Year 6', order: 6 },
  ])
})

/** A club row as the listing query returns it. */
const clubRow = (over: Record<string, unknown> = {}) => ({
  id: 'act-1', name: 'Chess', description: null, dayOfWeek: 1, timeSlot: 'AFTER_SCHOOL',
  location: null, cost: null, costDescription: null, maxCapacity: null,
  customStartTime: null, customEndTime: null, eligibleYearGroupIds: [],
  provider: { name: 'Infinite' },
  ecaTerm: {
    defaultBeforeSchoolStart: '07:30', defaultBeforeSchoolEnd: '08:15',
    defaultAfterSchoolStart: '15:30', defaultAfterSchoolEnd: '16:30',
  },
  _count: { providerBookings: 0 },
  ...over,
})

// Guards Phase C parent booking: ownership, tenancy, capacity, dedupe.
describe('POST /api/clubs/:activityId/book', () => {
  it('refuses to book a child that is not on the parent account', async () => {
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-999' })
    expect(res.status).toBe(403)
    expect(prismaMock.ecaActivity.findFirst).not.toHaveBeenCalled()
  })

  it('404 when the activity is not a provider club in the parent\'s school', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/clubs/act-x/book').send({ studentId: 'stu-1' })
    expect(res.status).toBe(404)
  })

  it('409 when the club is full', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', schoolId: 'school-1', maxCapacity: 2, paymentUrl: null })
    prismaMock.ecaProviderBooking.count.mockResolvedValue(2)
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-1' })
    expect(res.status).toBe(409)
    expect(prismaMock.ecaProviderBooking.create).not.toHaveBeenCalled()
  })

  it('409 when the child is already booked', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', schoolId: 'school-1', maxCapacity: null, paymentUrl: null })
    prismaMock.ecaProviderBooking.findUnique.mockResolvedValue({ id: 'bk-1', cancelledAt: null })
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-1' })
    expect(res.status).toBe(409)
  })

  it('creates a booking and returns the payment link', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1', schoolId: 'school-1', maxCapacity: null, paymentUrl: 'https://pay/x' })
    prismaMock.ecaProviderBooking.findUnique.mockResolvedValue(null)
    prismaMock.ecaProviderBooking.create.mockResolvedValue({
      id: 'bk-1', paymentStatus: 'UNPAID', cancelledAt: null, studentId: 'stu-1',
      ecaActivity: { id: 'act-1', name: 'Chess', paymentUrl: 'https://pay/x', cost: 120, costDescription: null }, createdAt: new Date(),
    })
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-1' })
    expect(res.status).toBe(201)
    expect(res.body.paymentUrl).toBe('https://pay/x')
    expect(prismaMock.ecaProviderBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ecaActivityId: 'act-1', studentId: 'stu-1', parentUserId: 'parent-1', schoolId: 'school-1' }) }),
    )
  })
})

describe('DELETE /api/clubs/bookings/:id', () => {
  it('only cancels the parent\'s own booking', async () => {
    prismaMock.ecaProviderBooking.updateMany.mockResolvedValue({ count: 0 })
    const res = await request(makeApp()).delete('/api/clubs/bookings/bk-other')
    expect(res.status).toBe(404)
    expect(prismaMock.ecaProviderBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'bk-other', parentUserId: 'parent-1' }) }),
    )
  })
})

describe('GET /api/clubs', () => {
  it('shows only published clubs on a term parents can see', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/clubs')
    expect(prismaMock.ecaActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          ecaTerm: { status: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE'] } },
        }),
      }),
    )
  })

  it('falls back to the term default time, and prefers the club\'s own', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([
      clubRow(),
      clubRow({ id: 'act-2', customStartTime: '16:00', customEndTime: '17:15' }),
    ])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/clubs')
    expect(res.body.clubs[0]).toMatchObject({ startTime: '15:30', endTime: '16:30', providerName: 'Infinite' })
    expect(res.body.clubs[1]).toMatchObject({ startTime: '16:00', endTime: '17:15' })
  })

  it('names the year groups a restricted club is open to, and only offers those children', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([clubRow({ eligibleYearGroupIds: ['yg-3'] })])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/clubs')
    expect(res.body.clubs[0].eligibleYearGroupNames).toEqual(['Year 3'])
    expect(res.body.clubs[0].eligibleStudentIds).toEqual(['stu-1'])
  })

  it('an unrestricted club accepts every child', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([clubRow()])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/clubs')
    expect(res.body.clubs[0].eligibleYearGroupNames).toEqual([])
    expect(res.body.clubs[0].eligibleStudentIds).toEqual(['stu-1', 'stu-2'])
  })

  // Older rows written by the admin ECA routes hold a JSON string here.
  it('reads a legacy stringified year-group list', async () => {
    prismaMock.ecaActivity.findMany.mockResolvedValue([clubRow({ eligibleYearGroupIds: '["yg-6"]' })])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/clubs')
    expect(res.body.clubs[0].eligibleStudentIds).toEqual(['stu-2'])
  })
})

describe('year-group eligibility on booking', () => {
  it('403 when the child is not in an eligible year group', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1', schoolId: 'school-1', maxCapacity: null, paymentUrl: null, eligibleYearGroupIds: ['yg-3'],
    })
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-2' })
    expect(res.status).toBe(403)
    expect(prismaMock.ecaProviderBooking.create).not.toHaveBeenCalled()
  })

  it('books the child who is in one', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({
      id: 'act-1', schoolId: 'school-1', maxCapacity: null, paymentUrl: null, eligibleYearGroupIds: ['yg-3'],
    })
    prismaMock.ecaProviderBooking.findUnique.mockResolvedValue(null)
    prismaMock.ecaProviderBooking.create.mockResolvedValue({
      id: 'bk-1', paymentStatus: 'UNPAID', cancelledAt: null, studentId: 'stu-1',
      ecaActivity: { id: 'act-1', name: 'Chess', paymentUrl: null, cost: null, costDescription: null }, createdAt: new Date(),
    })
    const res = await request(makeApp()).post('/api/clubs/act-1/book').send({ studentId: 'stu-1' })
    expect(res.status).toBe(201)
  })
})
