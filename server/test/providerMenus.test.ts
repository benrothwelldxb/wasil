import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  providerSchoolLink: { findMany: vi.fn() },
  cafeteriaMenu: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  cafeteriaMenuItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(prismaMock)),
  // referenced at module load but unused here:
  ecaProviderBooking: {}, ecaActivity: {}, ecaTerm: {}, provider: {}, providerUser: {},
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

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.providerSchoolLink.findMany.mockResolvedValue([{ schoolId: 'school-1' }])
})

// Guards Phase D catering: menus are scoped to the provider and its schools.
describe('provider menu scoping', () => {
  it('refuses to create a menu for a school the provider is not linked to', async () => {
    const res = await request(makeApp()).post('/api/provider-portal/menus').send({ schoolId: 'other-school', weekOf: '2026-09-07' })
    expect(res.status).toBe(404)
    expect(prismaMock.cafeteriaMenu.create).not.toHaveBeenCalled()
  })

  it('creates a menu with providerId stamped for a linked school', async () => {
    prismaMock.cafeteriaMenu.create.mockResolvedValue({ id: 'menu-1', title: 'Week 1', isPublished: false, _count: { items: 0 } })
    const res = await request(makeApp()).post('/api/provider-portal/menus').send({
      schoolId: 'school-1', weekOf: '2026-09-07', title: 'Week 1',
      items: [{ dayOfWeek: 1, name: 'Biryani', price: 15 }],
    })
    expect(res.status).toBe(201)
    expect(prismaMock.cafeteriaMenu.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerId: 'prov-1', schoolId: 'school-1' }) }),
    )
  })

  it('404 when editing a menu the provider does not own', async () => {
    prismaMock.cafeteriaMenu.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).put('/api/provider-portal/menus/menu-x').send({ title: 'Hijack' })
    expect(res.status).toBe(404)
  })

  it('scopes delete by providerId', async () => {
    prismaMock.cafeteriaMenu.deleteMany.mockResolvedValue({ count: 0 })
    const res = await request(makeApp()).delete('/api/provider-portal/menus/menu-x')
    expect(res.status).toBe(404)
    expect(prismaMock.cafeteriaMenu.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'menu-x', providerId: 'prov-1' }) }),
    )
  })
})
