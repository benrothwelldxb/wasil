import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  providerSchoolLink: { findMany: vi.fn() },
  ecaTerm: { findFirst: vi.fn() },
  ecaActivity: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  provider: { findUnique: vi.fn() },
  providerUser: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
// Inject an authenticated provider without exercising the JWT path.
vi.mock('../src/middleware/auth', () => ({
  // The portal router now mounts requireProviderOrSchoolAdmin (a provider
  // session OR the school's admin acting on one). These suites exercise the
  // provider path, so the stub injects a provider exactly as before.
  requireProviderOrSchoolAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { providerUser?: { id: string; providerId: string } }).providerUser = { id: 'pu-1', providerId: 'prov-1' }
    next()
  },
}))

const { default: providerPortalRoutes } = await import('../src/routes/providerPortal')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/provider-portal', providerPortalRoutes)
  return app
}

const termInclude = { name: 'Term 1', school: { id: 'school-1', name: 'VHPS' } }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.providerSchoolLink.findMany.mockResolvedValue([{ schoolId: 'school-1' }])
})

// Guards Phase B: a provider can only create/edit/delete its own activities and
// only within schools it is actually linked to.
describe('provider activity scoping', () => {
  it('refuses to create an activity in a term outside the provider\'s linked schools', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue(null) // term not in {school-1}
    const res = await request(makeApp()).post('/api/provider-portal/activities').send({
      ecaTermId: 'term-other-school', name: 'Chess', dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL',
    })
    expect(res.status).toBe(404)
    expect(prismaMock.ecaActivity.create).not.toHaveBeenCalled()
    // The term lookup must be constrained to the provider's schools.
    expect(prismaMock.ecaTerm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ schoolId: { in: ['school-1'] } }) }),
    )
  })

  it('creates an activity with providerId stamped when the term is linked', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1', schoolId: 'school-1' })
    prismaMock.ecaActivity.create.mockResolvedValue({
      id: 'act-1', name: 'Chess', description: null, dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL',
      location: null, maxCapacity: null, cost: null, costDescription: null, paymentUrl: null,
      isActive: true, isCancelled: false, ecaTermId: 'term-1', ecaTerm: termInclude, createdAt: new Date(),
    })
    const res = await request(makeApp()).post('/api/provider-portal/activities').send({
      ecaTermId: 'term-1', name: 'Chess', dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL', cost: 120,
    })
    expect(res.status).toBe(201)
    expect(prismaMock.ecaActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerId: 'prov-1', schoolId: 'school-1', activityType: 'OPEN' }) }),
    )
  })

  it('returns 404 when editing an activity the provider does not own', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue(null) // no row matches (id + providerId)
    const res = await request(makeApp()).patch('/api/provider-portal/activities/act-other').send({ name: 'Hijack' })
    expect(res.status).toBe(404)
    expect(prismaMock.ecaActivity.update).not.toHaveBeenCalled()
    expect(prismaMock.ecaActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'act-other', providerId: 'prov-1' }) }),
    )
  })

  it('new activities are created unpublished (create never sets isPublished true)', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1', schoolId: 'school-1' })
    prismaMock.ecaActivity.create.mockResolvedValue({
      id: 'act-1', name: 'Chess', description: null, dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL',
      location: null, maxCapacity: null, cost: null, costDescription: null, paymentUrl: null,
      isActive: true, isCancelled: false, isPublished: false, ecaTermId: 'term-1', ecaTerm: termInclude, createdAt: new Date(),
    })
    const res = await request(makeApp()).post('/api/provider-portal/activities').send({
      ecaTermId: 'term-1', name: 'Chess', dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL',
    })
    expect(res.status).toBe(201)
    expect(res.body.isPublished).toBe(false)
    // The create payload must not opt into publishing — the DB default (false) governs.
    const createArg = prismaMock.ecaActivity.create.mock.calls[0][0]
    expect(createArg.data.isPublished).toBeUndefined()
  })

  it('a provider can toggle isPublished on its own activity', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-1' }) // ownership passes
    prismaMock.ecaActivity.update.mockResolvedValue({
      id: 'act-1', name: 'Chess', description: null, dayOfWeek: 2, timeSlot: 'AFTER_SCHOOL',
      location: null, maxCapacity: null, cost: null, costDescription: null, paymentUrl: null,
      isActive: true, isCancelled: false, isPublished: true, ecaTermId: 'term-1', ecaTerm: termInclude, createdAt: new Date(),
    })
    const res = await request(makeApp()).patch('/api/provider-portal/activities/act-1').send({ isPublished: true })
    expect(res.status).toBe(200)
    expect(res.body.isPublished).toBe(true)
    expect(prismaMock.ecaActivity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'act-1' }, data: expect.objectContaining({ isPublished: true }) }),
    )
  })

  it('cannot toggle isPublished on another provider\'s activity (still gated)', async () => {
    prismaMock.ecaActivity.findFirst.mockResolvedValue(null) // ownership check fails
    const res = await request(makeApp()).patch('/api/provider-portal/activities/act-other').send({ isPublished: true })
    expect(res.status).toBe(404)
    expect(prismaMock.ecaActivity.update).not.toHaveBeenCalled()
    expect(prismaMock.ecaActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'act-other', providerId: 'prov-1' }) }),
    )
  })

  it('scopes delete by providerId (404 when nothing owned matches)', async () => {
    prismaMock.ecaActivity.deleteMany.mockResolvedValue({ count: 0 })
    const res = await request(makeApp()).delete('/api/provider-portal/activities/act-other')
    expect(res.status).toBe(404)
    expect(prismaMock.ecaActivity.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'act-other', providerId: 'prov-1' }) }),
    )
  })
})
