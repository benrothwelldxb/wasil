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
  ecaActivity: { groupBy: vi.fn(), findMany: vi.fn() },
  ecaActivityMember: { groupBy: vi.fn(), findMany: vi.fn() },
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
  prismaMock.ecaActivityMember.groupBy.mockResolvedValue([])
  prismaMock.ecaActivityMember.findMany.mockResolvedValue([])
  prismaMock.ecaActivity.findMany.mockResolvedValue([])
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

/**
 * AND WHERE THE REGISTER COMES FROM — IN TWO NUMBERS.
 *
 * CHILDREN and PLACES are different figures and only one of them is checkable.
 * A child in three clubs is three places but one child, so at the first school
 * to use this the places total (352) is larger than the entire roll (276).
 * "352 on registers" at a school of 276 children reads as an impossible number,
 * and the first explanation that comes to mind is that the integration is
 * double-counting — the wrong conclusion, and the same one drawn the last time
 * a count here was reported in the wrong noun.
 */
const memberRow = (studentId: string, ecaTermId: string) => ({
  studentId,
  ecaActivity: { ecaTermId },
})

describe('children in clubs, and places on registers', () => {
  const terms = () => request(makeApp()).get('/api/eca/terms')

  it('counts a child in three clubs as one child and three places', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      memberRow('stu-1', 'term-1'),
      memberRow('stu-1', 'term-1'),
      memberRow('stu-1', 'term-1'),
    ])

    const res = await terms()

    expect(res.body[0].enrolledChildren).toBe(1)
    expect(res.body[0].enrolledCount).toBe(3)
  })

  it('never reports more children than there are children', async () => {
    // The property that makes the headline safe to show a principal: the
    // children figure can be held against the roll and must never exceed it,
    // however many clubs each child joins.
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      memberRow('stu-1', 'term-1'), memberRow('stu-2', 'term-1'),
      memberRow('stu-1', 'term-1'), memberRow('stu-2', 'term-1'),
      memberRow('stu-1', 'term-1'),
    ])

    const res = await terms()

    expect(res.body[0].enrolledChildren).toBe(2)
    expect(res.body[0].enrolledCount).toBe(5)
  })

  it('never attributes a register to the wrong term', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      memberRow('stu-1', 'term-99'),
    ])

    const res = await terms()

    expect(res.body[0].enrolledChildren).toBe(0)
    expect(res.body[0].enrolledCount).toBe(0)
  })

  it('reports zero when no register has been published', async () => {
    // Zero means "no register exists", never "the clubs are empty" — which is
    // why the admin page shows the older wording instead of a zero.
    const res = await terms()
    expect(res.body[0].enrolledChildren).toBe(0)
  })

  it('does not fall over on a club with no term', async () => {
    prismaMock.ecaActivityMember.findMany.mockResolvedValue([
      { studentId: 'stu-1', ecaActivity: { ecaTermId: null } },
    ])

    const res = await terms()

    expect(res.status).toBe(200)
    expect(res.body[0].enrolledChildren).toBe(0)
  })
})
