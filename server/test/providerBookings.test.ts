import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  providerSchoolLink: { findMany: vi.fn() },
  ecaProviderBooking: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  // used by the fire-and-forget booking-paid notification:
  notification: { create: vi.fn().mockResolvedValue({}) },
  deviceToken: { findMany: vi.fn().mockResolvedValue([]) },
  // referenced elsewhere in the router module; unused here:
  provider: {}, providerUser: {}, ecaActivity: {}, ecaTerm: {},
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  requireProvider: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { providerUser?: { id: string; providerId: string } }).providerUser = { id: 'pu-1', providerId: 'prov-1' }
    next()
  },
}))
vi.mock('../src/services/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

const { default: providerPortalRoutes } = await import('../src/routes/providerPortal')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/provider-portal', providerPortalRoutes)
  return app
}

const booking = {
  id: 'bk-1', schoolId: 'school-1', paymentStatus: 'UNPAID', createdAt: new Date(),
  student: { firstName: 'Kid', lastName: 'One', class: { name: '3A' } },
  parentUser: { name: 'Parent P', email: 'p@x.com', phone: '+971500000000' },
  ecaActivity: { id: 'act-1', name: 'Chess' },
}

beforeEach(() => vi.clearAllMocks())

// Guards Phase C provider access: parent PII only flows when the school opted in,
// and payment updates are scoped to the provider's own bookings.
describe('GET /api/provider-portal/bookings — contact gating', () => {
  it('hides parent contact when the school has sharing OFF', async () => {
    prismaMock.providerSchoolLink.findMany.mockResolvedValue([{ schoolId: 'school-1', shareParentContact: false }])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([{ ...booking }])
    const res = await request(makeApp()).get('/api/provider-portal/bookings')
    expect(res.status).toBe(200)
    expect(res.body[0].studentName).toBe('Kid One') // still see child + class
    expect(res.body[0].parent).toBeNull()            // but never contact
  })

  it('includes parent contact when the school has sharing ON', async () => {
    prismaMock.providerSchoolLink.findMany.mockResolvedValue([{ schoolId: 'school-1', shareParentContact: true }])
    prismaMock.ecaProviderBooking.findMany.mockResolvedValue([{ ...booking }])
    const res = await request(makeApp()).get('/api/provider-portal/bookings')
    expect(res.body[0].parent).toEqual({ name: 'Parent P', email: 'p@x.com', phone: '+971500000000' })
  })
})

describe('PATCH /api/provider-portal/bookings/:id', () => {
  it('404 when the booking is not for the provider\'s own activity', async () => {
    prismaMock.ecaProviderBooking.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).patch('/api/provider-portal/bookings/bk-x').send({ paymentStatus: 'PAID' })
    expect(res.status).toBe(404)
    expect(prismaMock.ecaProviderBooking.update).not.toHaveBeenCalled()
    expect(prismaMock.ecaProviderBooking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'bk-x', ecaActivity: { providerId: 'prov-1' } }) }),
    )
  })

  it('updates payment status for an owned booking', async () => {
    prismaMock.ecaProviderBooking.findFirst.mockResolvedValue({
      id: 'bk-1', parentUserId: 'parent-1', schoolId: 'school-1',
      student: { firstName: 'Kid', lastName: 'One' },
      ecaActivity: { id: 'act-1', name: 'Chess' },
    })
    prismaMock.ecaProviderBooking.update.mockResolvedValue({})
    const res = await request(makeApp()).patch('/api/provider-portal/bookings/bk-1').send({ paymentStatus: 'PAID' })
    expect(res.status).toBe(200)
    expect(prismaMock.ecaProviderBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'PAID' } }),
    )
  })
})
