import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * POST /api/consultations/:id/teachers — one teacher or many.
 *
 * Everyone on a parents' evening shares the window, the location and the
 * generated slot grid; teachers configure nothing. So adding a primary
 * school's staff was ~30 passes through the same form typing the same times.
 *
 * The behaviour that matters is what happens to the ones that don't take:
 * skipping and reporting, never failing the batch, and never silently.
 */
const prismaMock = {
  consultationEvent: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  consultationTeacher: { findMany: vi.fn(), create: vi.fn() },
  user: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), notifyParents: vi.fn() }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId: 'sch-1', role: 'ADMIN' }
    next()
  }
  return { isAuthenticated: asAdmin, isAdmin: asAdmin, isStaff: asAdmin, loadUserWithRelations: vi.fn() }
})

const { default: consultationRoutes } = await import('../src/routes/consultations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/consultations', consultationRoutes)
  return app
}

const body = (over: Record<string, unknown> = {}) => ({
  location: 'Their own classroom',
  locationType: 'IN_PERSON',
  startTime: '15:30',
  endTime: '18:30',
  availabilityWindows: [{ date: '2026-10-14', startTime: '15:30', endTime: '18:30' }],
  ...over,
})

const post = (b: Record<string, unknown>) =>
  request(makeApp()).post('/api/consultations/ce-1/teachers').send(b)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationEvent.findFirst.mockResolvedValue({
    id: 'ce-1', schoolId: 'sch-1', slotDuration: 10, breakDuration: 0,
    date: '2026-10-14', endDate: null,
  })
  prismaMock.user.findMany.mockResolvedValue([{ id: 'u_1' }, { id: 'u_2' }, { id: 'u_3' }])
  prismaMock.consultationTeacher.findMany.mockResolvedValue([])
  prismaMock.consultationTeacher.create.mockImplementation(async ({ data }: any) => ({
    id: `ct-${data.teacherId}`,
    consultationId: data.consultationId,
    teacherId: data.teacherId,
    teacher: { id: data.teacherId, name: `Teacher ${data.teacherId}` },
    location: data.location,
    locationType: data.locationType,
    startTime: data.startTime,
    endTime: data.endTime,
    slots: [],
    availabilityWindows: [],
    createdAt: new Date(),
  }))
})

describe('adding several teachers at once', () => {
  it('creates one ConsultationTeacher per id, sharing the window and location', async () => {
    const res = await post(body({ teacherIds: ['u_1', 'u_2', 'u_3'] }))

    expect(res.status).toBe(201)
    expect(res.body.added).toHaveLength(3)
    expect(res.body.skipped).toEqual([])
    expect(prismaMock.consultationTeacher.create).toHaveBeenCalledTimes(3)
    // Same window for all of them — per-teacher differences are edited after.
    for (const call of prismaMock.consultationTeacher.create.mock.calls) {
      expect(call[0].data).toMatchObject({ startTime: '15:30', endTime: '18:30', location: 'Their own classroom' })
    }
  })

  // An admin who added three people by hand and then reaches for "everyone"
  // should not have to work out which three.
  it('skips a teacher already on the event and says so, without failing the batch', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([{ teacherId: 'u_2' }])

    const res = await post(body({ teacherIds: ['u_1', 'u_2', 'u_3'] }))

    expect(res.status).toBe(201)
    expect(res.body.added).toHaveLength(2)
    expect(res.body.skipped).toEqual([{ teacherId: 'u_2', reason: 'already on this event' }])
    expect(prismaMock.consultationTeacher.create).toHaveBeenCalledTimes(2)
  })

  it('skips an id that is not staff at this school, with a reason', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u_1' }])

    const res = await post(body({ teacherIds: ['u_1', 'u_parent'] }))

    expect(res.body.added).toHaveLength(1)
    expect(res.body.skipped).toEqual([
      { teacherId: 'u_parent', reason: 'not a staff member at this school' },
    ])
  })

  // Every id skipped is still a 201 with an empty `added` — the request was
  // understood and nothing was wrong with it. The caller reads `added`.
  it('reports an all-skipped batch rather than erroring', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([{ teacherId: 'u_1' }, { teacherId: 'u_2' }])

    const res = await post(body({ teacherIds: ['u_1', 'u_2'] }))

    expect(res.status).toBe(201)
    expect(res.body.added).toEqual([])
    expect(res.body.skipped).toHaveLength(2)
    expect(prismaMock.consultationTeacher.create).not.toHaveBeenCalled()
  })

  it('deduplicates repeated ids rather than adding a teacher twice', async () => {
    const res = await post(body({ teacherIds: ['u_1', 'u_1'] }))
    expect(res.body.added).toHaveLength(1)
    expect(prismaMock.consultationTeacher.create).toHaveBeenCalledTimes(1)
  })

  it('an empty list is a 400, not a silent success', async () => {
    const res = await post(body({ teacherIds: [] }))
    expect(res.status).toBe(400)
    expect(prismaMock.consultationTeacher.create).not.toHaveBeenCalled()
  })

  it('404s on an event belonging to another school', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue(null)
    const res = await post(body({ teacherIds: ['u_1'] }))
    expect(res.status).toBe(404)
  })
})

describe('the single-teacher call is unchanged', () => {
  // Anything already calling this route must not meet a new shape.
  it('returns the original object, not the batch shape', async () => {
    const res = await post(body({ teacherId: 'u_1' }))

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ teacherId: 'u_1', teacherName: 'Teacher u_1' })
    expect(res.body).not.toHaveProperty('added')
    expect(res.body).not.toHaveProperty('skipped')
  })

  it('keeps its 404 for an unknown teacher', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    const res = await post(body({ teacherId: 'u_ghost' }))
    expect(res.status).toBe(404)
  })

  it('keeps its 404 for a teacher already on the event', async () => {
    prismaMock.consultationTeacher.findMany.mockResolvedValue([{ teacherId: 'u_1' }])
    const res = await post(body({ teacherId: 'u_1' }))
    expect(res.status).toBe(404)
  })
})

/**
 * The evening's own times.
 *
 * Slot and break duration already lived on the event; start and end only
 * existed per teacher, so setting up parents' evening meant holding the times
 * in your head and typing them once per teacher.
 */
describe("the event's default session times", () => {
  beforeEach(() => {
    prismaMock.consultationEvent.create.mockImplementation(async ({ data }: any) => ({ id: 'ce-new', ...data }))
  })

  const create = (b: Record<string, unknown>) =>
    request(makeApp()).post('/api/consultations').send({ title: "Autumn Parents' Evening", date: '2026-10-14', ...b })

  it('stores them on the event', async () => {
    const res = await create({ defaultStartTime: '15:30', defaultEndTime: '18:30' })
    expect(res.status).toBe(201)
    expect(prismaMock.consultationEvent.create.mock.calls[0][0].data).toMatchObject({
      defaultStartTime: '15:30', defaultEndTime: '18:30',
    })
  })

  // "No default set" and "runs from midnight" must not be the same value.
  it('leaves them null when blank rather than storing an empty string', async () => {
    await create({ defaultStartTime: '', defaultEndTime: '' })
    expect(prismaMock.consultationEvent.create.mock.calls[0][0].data).toMatchObject({
      defaultStartTime: null, defaultEndTime: null,
    })
  })

  // A bad value here would generate every teacher's whole slot grid at the
  // wrong times, which is far more work to unpick than a rejected field.
  it('drops an unparseable time instead of storing it', async () => {
    await create({ defaultStartTime: 'half three', defaultEndTime: '25:00' })
    expect(prismaMock.consultationEvent.create.mock.calls[0][0].data).toMatchObject({
      defaultStartTime: null, defaultEndTime: null,
    })
  })

  it('an event created without them is still valid', async () => {
    const res = await create({})
    expect(res.status).toBe(201)
    expect(prismaMock.consultationEvent.create.mock.calls[0][0].data).toMatchObject({
      defaultStartTime: null, defaultEndTime: null,
    })
  })
})
