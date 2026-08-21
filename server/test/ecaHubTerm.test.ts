import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Read-only guards for Hub-sourced ECA terms. A Hub term (hubTermId != null) is
// identity-managed in Wasil Hub: the route must expose `fromHub`, refuse DELETE,
// and ignore incoming name/dates on PUT while still applying the Connect-owned
// workflow fields (registration windows, session times, termNumber). Status
// transitions (PATCH) stay fully available — that's how the admin opens
// registration. Manual terms (hubTermId null) are unaffected.
const prismaMock = {
  ecaTerm: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers['x-admin'] !== 'yes') return res.status(403).json({ error: 'forbidden' })
    ;(req as any).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({ id: 'parent-1', schoolId: 'school-1', studentLinks: [] })),
}))

vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({
  sendEcaRegistrationOpenNotification: vi.fn(),
  sendEcaAllocationResultsNotification: vi.fn(),
  sendEcaInvitationNotification: vi.fn(),
}))
vi.mock('../src/services/ecaAllocation', () => ({ runAllocation: vi.fn(), previewAllocation: vi.fn() }))
vi.mock('../src/services/ecaPdf', () => ({ generateAttendanceRegisterHtml: vi.fn(), generateBlankRegisterHtml: vi.fn() }))

const { default: ecaRoutes } = await import('../src/routes/eca')
const notify = await import('../src/services/notify')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/eca', ecaRoutes)
  return app
}

const NOW = new Date('2026-08-21T00:00:00.000Z')

function dbTerm(over: Record<string, unknown> = {}) {
  return {
    id: 'term-1',
    schoolId: 'school-1',
    name: 'Autumn Term',
    termNumber: 1,
    academicYear: '2026/27',
    startDate: NOW,
    endDate: NOW,
    registrationOpens: null,
    registrationCloses: null,
    defaultBeforeSchoolStart: null,
    defaultBeforeSchoolEnd: null,
    defaultAfterSchoolStart: null,
    defaultAfterSchoolEnd: null,
    status: 'DRAFT',
    allocationRun: false,
    hubTermId: 'ht-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('GET /terms serializes fromHub', () => {
  it('marks Hub terms fromHub:true and manual terms fromHub:false; null registration serializes to null', async () => {
    prismaMock.ecaTerm.findMany.mockResolvedValue([
      { ...dbTerm({ id: 'hub', hubTermId: 'ht-1' }), _count: { activities: 0, selections: 0, allocations: 0 } },
      { ...dbTerm({ id: 'manual', hubTermId: null, registrationOpens: NOW, registrationCloses: NOW }), _count: { activities: 0, selections: 0, allocations: 0 } },
    ])

    const res = await request(makeApp()).get('/api/eca/terms').set('x-admin', 'yes')
    expect(res.status).toBe(200)
    const [hub, manual] = res.body
    expect(hub.fromHub).toBe(true)
    expect(hub.registrationOpens).toBeNull()
    expect(manual.fromHub).toBe(false)
    expect(manual.registrationOpens).toBe(NOW.toISOString())
  })
})

describe('DELETE /terms/:id', () => {
  it('rejects a Hub term with 400 and does not delete', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue(dbTerm({ hubTermId: 'ht-1' }))

    const res = await request(makeApp()).delete('/api/eca/terms/term-1').set('x-admin', 'yes')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('This term is managed in Wasil Hub')
    expect(prismaMock.ecaTerm.delete).not.toHaveBeenCalled()
  })

  it('allows deleting a manual term', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue(dbTerm({ hubTermId: null }))
    prismaMock.ecaTerm.delete.mockResolvedValue({ id: 'term-1' })

    const res = await request(makeApp()).delete('/api/eca/terms/term-1').set('x-admin', 'yes')
    expect(res.status).toBe(200)
    expect(prismaMock.ecaTerm.delete).toHaveBeenCalledWith({ where: { id: 'term-1' } })
  })
})

describe('PUT /terms/:id identity-lock', () => {
  it('ignores incoming name/dates on a Hub term but applies workflow fields', async () => {
    const existing = dbTerm({ hubTermId: 'ht-1', name: 'Autumn Term', startDate: NOW, endDate: NOW })
    prismaMock.ecaTerm.findFirst.mockResolvedValue(existing)
    prismaMock.ecaTerm.update.mockImplementation(async ({ data }: any) => ({ ...existing, ...data }))

    const res = await request(makeApp())
      .put('/api/eca/terms/term-1')
      .set('x-admin', 'yes')
      .send({
        name: 'HACKED NAME',
        startDate: '2099-01-01',
        endDate: '2099-06-01',
        registrationOpens: '2026-08-25',
        registrationCloses: '2026-09-10',
        defaultAfterSchoolStart: '15:30',
        termNumber: 2,
      })

    expect(res.status).toBe(200)
    const data = prismaMock.ecaTerm.update.mock.calls[0][0].data
    // Identity is kept from the existing Hub row, not the request body.
    expect(data.name).toBe('Autumn Term')
    expect(data.startDate).toEqual(NOW)
    expect(data.endDate).toEqual(NOW)
    // Workflow fields ARE applied.
    expect(data.registrationOpens).toEqual(new Date('2026-08-25'))
    expect(data.registrationCloses).toEqual(new Date('2026-09-10'))
    expect(data.defaultAfterSchoolStart).toBe('15:30')
    expect(data.termNumber).toBe(2)
  })

  it('applies name/dates on a manual term', async () => {
    const existing = dbTerm({ hubTermId: null })
    prismaMock.ecaTerm.findFirst.mockResolvedValue(existing)
    prismaMock.ecaTerm.update.mockImplementation(async ({ data }: any) => ({ ...existing, ...data }))

    await request(makeApp())
      .put('/api/eca/terms/term-1')
      .set('x-admin', 'yes')
      .send({ name: 'Renamed', startDate: '2027-01-01', endDate: '2027-04-01' })

    const data = prismaMock.ecaTerm.update.mock.calls[0][0].data
    expect(data.name).toBe('Renamed')
    expect(data.startDate).toEqual(new Date('2027-01-01'))
    expect(data.endDate).toEqual(new Date('2027-04-01'))
  })
})

describe('PATCH /terms/:id/status stays available for Hub terms', () => {
  it('opens registration on a Hub term (DRAFT → REGISTRATION_OPEN)', async () => {
    const existing = dbTerm({ hubTermId: 'ht-1', status: 'DRAFT' })
    prismaMock.ecaTerm.findFirst.mockResolvedValue(existing)
    prismaMock.ecaTerm.update.mockResolvedValue(dbTerm({ hubTermId: 'ht-1', status: 'REGISTRATION_OPEN' }))

    const res = await request(makeApp())
      .patch('/api/eca/terms/term-1/status')
      .set('x-admin', 'yes')
      .send({ status: 'REGISTRATION_OPEN' })

    expect(res.status).toBe(200)
    expect(prismaMock.ecaTerm.update).toHaveBeenCalledWith({
      where: { id: 'term-1' },
      data: { status: 'REGISTRATION_OPEN' },
    })
    expect(res.body.fromHub).toBe(true)
    // No registration window set yet → the open-registration email is skipped.
    expect(notify.sendEcaRegistrationOpenNotification).not.toHaveBeenCalled()
  })
})
