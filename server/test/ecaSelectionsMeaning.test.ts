import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * "27 activities, 0 selections."
 *
 * `selectionCount` counts sign-ups made through CONNECT's own registration
 * flow. At a school whose programme is pushed from Active, that flow does not
 * run and never will — Active owns the choosing, and the only thing it can
 * push here is the activities themselves. So the number is not "nobody signed
 * up". It is "signing up does not happen here", and it can only ever be zero.
 *
 * Reading it the first way is the natural mistake and it is the expensive one:
 * a principal sees 27 activities and 0 selections and concludes the
 * integration is broken. That is exactly what happened.
 *
 * So the list says where the signing up actually happens, and only shows a
 * selections figure where that figure can mean something.
 */

const prismaMock = {
  ecaTerm: { findMany: vi.fn() },
  ecaActivity: { groupBy: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'admin-1', schoolId: 'sch-1' }
    next()
  },
  isAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as any).user = { id: 'admin-1', schoolId: 'sch-1' }
    next()
  },
  loadUserWithRelations: vi.fn(async () => ({ id: 'admin-1', schoolId: 'sch-1', studentLinks: [] })),
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

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/eca', ecaRoutes)
  return app
}

function term(over: Record<string, unknown> = {}) {
  return {
    id: 'term-1',
    name: 'Autumn Term',
    hubTermId: 'hub-1',
    startDate: new Date('2026-08-31'),
    endDate: new Date('2026-12-11'),
    registrationOpens: null,
    registrationCloses: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { activities: 27, selections: 0, allocations: 0 },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.ecaTerm.findMany.mockResolvedValue([term()])
  prismaMock.ecaActivity.groupBy.mockResolvedValue([])
})

describe('where the signing up happens', () => {
  it('reports a term whose activities came from another product', async () => {
    // VHPS: 27 activities pushed from Active, none made in Connect.
    prismaMock.ecaActivity.groupBy.mockResolvedValue([
      { ecaTermId: 'term-1', _count: { _all: 27 } },
    ])

    const res = await request(makeApp()).get('/api/eca/terms')

    expect(res.body[0].externalActivityCount).toBe(27)
    // The raw count is still reported — the page decides what to show, and
    // hiding the number from the API would stop a school that DOES use
    // Connect's flow from ever seeing it.
    expect(res.body[0].selectionCount).toBe(0)
  })

  it('reports zero for a term a school built here', async () => {
    const res = await request(makeApp()).get('/api/eca/terms')

    expect(res.body[0].externalActivityCount).toBe(0)
  })

  it('asks only about this school, and only about pushed activities', async () => {
    await request(makeApp()).get('/api/eca/terms')

    const where = prismaMock.ecaActivity.groupBy.mock.calls[0][0].where
    expect(where.schoolId).toBe('sch-1')
    // `source` is null for anything a human created in Connect.
    expect(where.source).toEqual({ not: null })
  })

  it('does not fall over when a term has no activities at all', async () => {
    prismaMock.ecaTerm.findMany.mockResolvedValue([
      term({ id: 'term-2', _count: { activities: 0, selections: 0, allocations: 0 } }),
    ])

    const res = await request(makeApp()).get('/api/eca/terms')

    expect(res.status).toBe(200)
    expect(res.body[0].externalActivityCount).toBe(0)
  })
})
