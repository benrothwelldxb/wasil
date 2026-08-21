import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Parent-facing "Show on parent app" gating: unpublished ECA activities must be
// invisible to and unselectable by parents, while admins keep seeing everything.
const prismaMock = {
  ecaTerm: { findFirst: vi.fn(), findMany: vi.fn() },
  ecaActivity: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  ecaSelection: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  ecaInvitation: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  ecaSettings: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

// req.user is a parent for isAuthenticated; isAdmin flips a header so a single
// suite can exercise both the parent and admin term-detail endpoints.
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
  loadUserWithRelations: vi.fn(async () => ({
    id: 'parent-1',
    schoolId: 'school-1',
    studentLinks: [{ studentId: 'stu-1' }],
  })),
}))

// These services are only hit by admin flows we don't exercise here; stub them
// so importing the router is side-effect free.
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

beforeEach(() => vi.clearAllMocks())

describe('parent term view gates on isPublished', () => {
  it('queries only published, active, non-cancelled activities for the parent', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'term-1', schoolId: 'school-1', name: 'Term 1', status: 'REGISTRATION_OPEN',
      startDate: new Date(), endDate: new Date(), registrationOpens: new Date(), registrationCloses: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
      activities: [], // published-only set (prisma applies the where)
    })
    prismaMock.student.findMany.mockResolvedValue([])
    prismaMock.ecaSelection.findMany.mockResolvedValue([])
    prismaMock.ecaInvitation.findMany.mockResolvedValue([])

    const res = await request(makeApp()).get('/api/eca/parent/terms/term-1')
    expect(res.status).toBe(200)

    const call = prismaMock.ecaTerm.findFirst.mock.calls[0][0]
    expect(call.include.activities.where).toEqual(
      expect.objectContaining({ isActive: true, isCancelled: false, isPublished: true }),
    )
  })
})

describe('admin term view is NOT gated on isPublished', () => {
  it('includes activities with no isPublished filter for admins', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'term-1', schoolId: 'school-1', name: 'Term 1',
      startDate: new Date(), endDate: new Date(), registrationOpens: new Date(), registrationCloses: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
      activities: [],
    })

    const res = await request(makeApp()).get('/api/eca/terms/term-1').set('x-admin', 'yes')
    expect(res.status).toBe(200)

    const call = prismaMock.ecaTerm.findFirst.mock.calls[0][0]
    // Admin include either has no where, or at least no isPublished restriction.
    const where = call.include.activities.where
    expect(where?.isPublished).toBeUndefined()
  })
})

describe('parent selection submit rejects unpublished activities', () => {
  const term = { id: 'term-1', schoolId: 'school-1', status: 'REGISTRATION_OPEN' }

  it('400 when a chosen activity is not published/selectable', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue(term)
    prismaMock.ecaActivity.count.mockResolvedValue(0) // none of the requested are selectable

    const res = await request(makeApp())
      .post('/api/eca/parent/terms/term-1/selections')
      .send({ studentId: 'stu-1', selections: [{ activityId: 'hidden-act', rank: 1, isPriority: false }] })

    expect(res.status).toBe(400)
    expect(prismaMock.ecaSelection.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.ecaSelection.create).not.toHaveBeenCalled()
    // The selectability check must require isPublished true within this term.
    expect(prismaMock.ecaActivity.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ecaTermId: 'term-1', isPublished: true }) }),
    )
  })

  it('saves selections when every chosen activity is published', async () => {
    prismaMock.ecaTerm.findFirst.mockResolvedValue(term)
    prismaMock.ecaActivity.count.mockResolvedValue(1) // the one requested is selectable
    prismaMock.ecaSelection.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.ecaSelection.create.mockResolvedValue({ id: 'sel-1' })

    const res = await request(makeApp())
      .post('/api/eca/parent/terms/term-1/selections')
      .send({ studentId: 'stu-1', selections: [{ activityId: 'live-act', rank: 1, isPriority: false }] })

    expect(res.status).toBe(200)
    expect(prismaMock.ecaSelection.create).toHaveBeenCalledTimes(1)
  })
})
