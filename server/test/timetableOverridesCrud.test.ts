import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// CRUD for the admin this-week override endpoints, with Prisma + auth mocked.
// The auth mock stamps a school-scoped admin user (id + schoolId).

const prismaMock = {
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn(), findFirst: vi.fn() },
  subjectReminder: { findMany: vi.fn() },
  timetableOverride: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  }
  return { isAuthenticated: setUser, isAdmin: setUser, loadUserWithRelations: vi.fn() }
})

async function makeApp() {
  const { default: router } = await import('../src/routes/timetable')
  const app = express()
  app.use(express.json())
  app.use('/api/timetable', router)
  return app
}

const dbRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'ov-1',
  classId: 'cc-1',
  date: new Date('2026-07-13T00:00:00.000Z'),
  subject: 'Swimming',
  subjectKey: 'swimming',
  emoji: null,
  action: 'CANCELLED',
  note: null,
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('GET /api/timetable/overrides', () => {
  it('returns the window rows for the school, serialising date to YYYY-MM-DD', async () => {
    prismaMock.timetableOverride.findMany.mockResolvedValue([dbRow()])
    const res = await request(await makeApp()).get('/api/timetable/overrides?from=2026-07-13&to=2026-07-17')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'ov-1', classId: 'cc-1', date: '2026-07-13', action: 'CANCELLED' }),
    ])
    // Scoped to the school and the window.
    const where = prismaMock.timetableOverride.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('school-1')
    expect(where.date.gte).toEqual(new Date('2026-07-13T00:00:00.000Z'))
  })

  it('400s on a missing/invalid window', async () => {
    const res = await request(await makeApp()).get('/api/timetable/overrides?from=2026-07-13')
    expect(res.status).toBe(400)
    expect(prismaMock.timetableOverride.findMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/timetable/overrides', () => {
  it('derives subjectKey, stamps createdByUserId, and stores UTC-midnight date', async () => {
    prismaMock.class.findFirst.mockResolvedValue({ id: 'cc-1' })
    prismaMock.timetableOverride.create.mockResolvedValue(dbRow({ subject: 'Swimming', subjectKey: 'swimming' }))

    const res = await request(await makeApp())
      .post('/api/timetable/overrides')
      .send({ classId: 'cc-1', date: '2026-07-13', subject: '  Swimming ', action: 'CANCELLED' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 'ov-1', subjectKey: 'swimming', date: '2026-07-13' })
    const data = prismaMock.timetableOverride.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      schoolId: 'school-1',
      classId: 'cc-1',
      subject: 'Swimming',
      subjectKey: 'swimming',
      action: 'CANCELLED',
      createdByUserId: 'admin-1',
    })
    expect(data.date).toEqual(new Date('2026-07-13T00:00:00.000Z'))
  })

  it('rejects a classId from another school with 404 and never writes', async () => {
    prismaMock.class.findFirst.mockResolvedValue(null) // not in this school
    const res = await request(await makeApp())
      .post('/api/timetable/overrides')
      .send({ classId: 'other-school-class', date: '2026-07-13', subject: 'Swimming', action: 'ADDED' })
    expect(res.status).toBe(404)
    expect(prismaMock.timetableOverride.create).not.toHaveBeenCalled()
    // The tenant check is scoped by schoolId.
    expect(prismaMock.class.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'other-school-class',
      schoolId: 'school-1',
    })
  })

  it('400s on an invalid action', async () => {
    prismaMock.class.findFirst.mockResolvedValue({ id: 'cc-1' })
    const res = await request(await makeApp())
      .post('/api/timetable/overrides')
      .send({ classId: 'cc-1', date: '2026-07-13', subject: 'Swimming', action: 'MOVED' })
    expect(res.status).toBe(400)
    expect(prismaMock.timetableOverride.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/timetable/overrides/:id', () => {
  it('deletes school-scoped and 200s', async () => {
    prismaMock.timetableOverride.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(await makeApp()).delete('/api/timetable/overrides/ov-1')
    expect(res.status).toBe(200)
    expect(prismaMock.timetableOverride.deleteMany.mock.calls[0][0].where).toEqual({ id: 'ov-1', schoolId: 'school-1' })
  })

  it('404s when the row is not in the school', async () => {
    prismaMock.timetableOverride.deleteMany.mockResolvedValue({ count: 0 })
    const res = await request(await makeApp()).delete('/api/timetable/overrides/ov-x')
    expect(res.status).toBe(404)
  })
})
