import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  ecaActivity: { findFirst: vi.fn(), findMany: vi.fn() },
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
    studentLinks: [{ studentId: 'stu-1', student: { firstName: 'Kid', lastName: 'One', class: { name: '3A' } } }],
  })),
}))

const { default: clubsRoutes } = await import('../src/routes/clubs')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/clubs', clubsRoutes)
  return app
}

beforeEach(() => vi.clearAllMocks())

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
