import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Transport — the Desk push, and the one guardian-scoped read.
 *
 * Because the school collects door-to-door, a stop name is a child's home
 * address. These tests exist as much to hold the guardrails in docs/adr/0001 as
 * to check the happy path.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn() },
  student: { findMany: vi.fn() },
  transportAssignment: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
  isStaff: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
  loadUserWithRelations,
  requireProviderOrSchoolAdmin: (_r: express.Request, _s: express.Response, n: express.NextFunction) => n(),
}))

const { default: partnerRoutes } = await import('../src/routes/partner')
const { default: transportRoutes } = await import('../src/routes/transport')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  app.use('/api/transport', transportRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const PAYLOAD = {
  school_id: 'hub-1',
  leg: 'AM',
  routes: [
    {
      id: 'r1', name: 'Bus 3', code: 'B3',
      stops: [
        { id: 's1', name: 'Villa 27, Alvorada 2', time_local: '06:52', pupils: [{ hub_pupil_id: 'hp-1' }] },
        { id: 's2', name: 'Villa 4, Alvorada 1', time_local: '06:58', pupils: [{ hub_pupil_id: 'hp-2' }] },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.student.findMany.mockResolvedValue([
    { id: 'stu-1', hubPupilId: 'hp-1' },
    { id: 'stu-2', hubPupilId: 'hp-2' },
  ])
  prismaMock.transportAssignment.upsert.mockResolvedValue({})
  prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 0 })
})

describe('PUT /api/partner/transport/assignments', () => {
  const put = (body: Record<string, unknown>) =>
    auth(request(makeApp()).put('/api/partner/transport/assignments').send(body))

  it('flattens routes and stops into one row per child', async () => {
    const res = await put(PAYLOAD)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ updated: 2, skippedUnknownPupil: 0 })
    expect(prismaMock.transportAssignment.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.transportAssignment.upsert.mock.calls[0][0]).toMatchObject({
      where: { studentId_leg: { studentId: 'stu-1', leg: 'AM' } },
      create: expect.objectContaining({ routeName: 'Bus 3', stopName: 'Villa 27, Alvorada 2', timeLocal: '06:52' }),
    })
  })

  // Full replacement: anything the push does not mention is off the roster, and
  // a retained row is a child's home address nobody meant to keep.
  it('deletes assignments the push no longer mentions, for that leg only', async () => {
    await put(PAYLOAD)

    expect(prismaMock.transportAssignment.deleteMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1', leg: 'AM', studentId: { notIn: ['stu-1', 'stu-2'] } },
    })
  })

  it('an empty payload clears the leg rather than doing nothing', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 7 })

    const res = await put({ school_id: 'hub-1', leg: 'PM', routes: [] })

    expect(res.body).toMatchObject({ updated: 0, removed: 7 })
    expect(prismaMock.transportAssignment.deleteMany).toHaveBeenCalledWith({
      where: { schoolId: 'school-1', leg: 'PM', studentId: { notIn: [] } },
    })
  })

  it('re-sending the same payload is a no-op beyond timestamps', async () => {
    await put(PAYLOAD)
    const first = prismaMock.transportAssignment.upsert.mock.calls.map(c => c[0])
    vi.clearAllMocks()
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
    prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
    prismaMock.student.findMany.mockResolvedValue([
      { id: 'stu-1', hubPupilId: 'hp-1' },
      { id: 'stu-2', hubPupilId: 'hp-2' },
    ])
    prismaMock.transportAssignment.deleteMany.mockResolvedValue({ count: 0 })

    await put(PAYLOAD)
    expect(prismaMock.transportAssignment.upsert.mock.calls.map(c => c[0])).toEqual(first)
  })

  it('counts a pupil Connect has not synced rather than guessing', async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: 'stu-1', hubPupilId: 'hp-1' }])
    const res = await put(PAYLOAD)
    expect(res.body).toMatchObject({ updated: 1, skippedUnknownPupil: 1 })
  })

  it('carries the suppression flag through', async () => {
    await put({
      ...PAYLOAD,
      routes: [{ id: 'r1', name: 'Bus 3', stops: [
        { id: 's1', name: 'Villa 27', time_local: '06:52', hide_stop_name: true, pupils: [{ hub_pupil_id: 'hp-1' }] },
      ] }],
    })
    expect(prismaMock.transportAssignment.upsert.mock.calls[0][0].create.hideStopName).toBe(true)
  })

  it('rejects a leg that is not AM or PM', async () => {
    const res = await put({ school_id: 'hub-1', leg: 'EVENING', routes: [] })
    expect(res.status).toBe(400)
    expect(prismaMock.transportAssignment.deleteMany).not.toHaveBeenCalled()
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp()).put('/api/partner/transport/assignments').send(PAYLOAD)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/transport/mine', () => {
  beforeEach(() => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1',
      schoolId: 'school-1',
      studentLinks: [{ studentId: 'stu-1', student: { firstName: 'Amina', lastName: 'Said', class: { name: '3A' } } }],
    })
  })

  it('returns only this guardian\'s own children', async () => {
    prismaMock.transportAssignment.findMany.mockResolvedValue([
      { studentId: 'stu-1', leg: 'AM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '06:52', hideStopName: false },
      { studentId: 'stu-1', leg: 'PM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '15:40', hideStopName: false },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    expect(res.status).toBe(200)
    expect(res.body.children).toHaveLength(1)
    expect(res.body.children[0]).toMatchObject({ studentName: 'Amina Said' })
    expect(res.body.children[0].legs).toHaveLength(2)
    // The scope is the guardian's own children AND their school — both, so a
    // stale link cannot reach another tenancy's row.
    expect(prismaMock.transportAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: { in: ['stu-1'] }, schoolId: 'school-1' } }),
    )
  })

  // The separated-family case: route and time still answer "which bus, when",
  // without disclosing one parent's address to the other.
  it('withholds a suppressed stop name but keeps route and time', async () => {
    prismaMock.transportAssignment.findMany.mockResolvedValue([
      { studentId: 'stu-1', leg: 'AM', routeName: 'Bus 3', routeCode: 'B3', stopName: 'Villa 27', timeLocal: '06:52', hideStopName: true },
    ])

    const res = await request(makeApp()).get('/api/transport/mine')

    const legs = res.body.children[0].legs
    expect(legs[0]).toMatchObject({ stopName: null, stopNameHidden: true, routeName: 'Bus 3', timeLocal: '06:52' })
    expect(JSON.stringify(res.body)).not.toContain('Villa 27')
  })

  it('a guardian with no children asks the database for nothing', async () => {
    loadUserWithRelations.mockResolvedValue({ id: 'parent-1', schoolId: 'school-1', studentLinks: [] })
    const res = await request(makeApp()).get('/api/transport/mine')
    expect(res.body).toEqual({ children: [] })
    expect(prismaMock.transportAssignment.findMany).not.toHaveBeenCalled()
  })

  // Absent is not empty: a screen that quietly shows no bus is worse than one
  // that admits it is broken.
  it('a failure is a 500, never an empty list', async () => {
    prismaMock.transportAssignment.findMany.mockRejectedValue(new Error('db down'))
    const res = await request(makeApp()).get('/api/transport/mine')
    expect(res.status).toBe(500)
    expect(res.body.children).toBeUndefined()
  })
})
