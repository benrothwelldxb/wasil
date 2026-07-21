import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// The per-school subject→reminder map CRUD (mounted on the schedule router) and
// the default-seeding helper. Prisma + auth + the schedule router's incidental
// service deps are module-mocked; no DB.

const prismaMock = {
  subjectReminder: {
    count: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  // Referenced elsewhere in the schedule router at module load / other routes:
  scheduleItem: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(async () => {}) }))
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  isAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  },
  loadUserWithRelations: vi.fn(),
}))

const { default: scheduleRouter } = await import('../src/routes/schedule')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/schedule', scheduleRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/schedule/reminders — list + default seeding', () => {
  it('seeds the four defaults when the school has none, then returns rows', async () => {
    prismaMock.subjectReminder.count.mockResolvedValue(0)
    prismaMock.subjectReminder.createMany.mockResolvedValue({ count: 4 })
    prismaMock.subjectReminder.findMany.mockResolvedValue([
      { id: 'r1', subject: 'Swimming', emoji: '🏊', reminder: 'Remember swimwear, towel & goggles', active: true, createdAt: 'x', updatedAt: 'x' },
    ])

    const res = await request(makeApp()).get('/api/schedule/reminders')
    expect(res.status).toBe(200)
    expect(prismaMock.subjectReminder.createMany).toHaveBeenCalledTimes(1)
    const seeded = prismaMock.subjectReminder.createMany.mock.calls[0][0].data
    expect(seeded.map((d: { subjectKey: string }) => d.subjectKey)).toEqual(['swimming', 'pe', 'library', 'music'])
    expect(seeded.every((d: { schoolId: string }) => d.schoolId === 'school-1')).toBe(true)
    expect(res.body).toHaveLength(1)
  })

  it('does NOT seed (or clobber edits) when rows already exist', async () => {
    prismaMock.subjectReminder.count.mockResolvedValue(3)
    prismaMock.subjectReminder.findMany.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/schedule/reminders')
    expect(res.status).toBe(200)
    expect(prismaMock.subjectReminder.createMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/schedule/reminders', () => {
  it('derives subjectKey and creates', async () => {
    prismaMock.subjectReminder.findUnique.mockResolvedValue(null)
    prismaMock.subjectReminder.create.mockResolvedValue({ id: 'r9', subject: 'Forest School', emoji: '🌲', reminder: 'Wear wellies', active: true, createdAt: 'x', updatedAt: 'x' })
    const res = await request(makeApp()).post('/api/schedule/reminders').send({ subject: '  Forest School ', emoji: '🌲', reminder: 'Wear wellies' })
    expect(res.status).toBe(201)
    expect(prismaMock.subjectReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ schoolId: 'school-1', subject: 'Forest School', subjectKey: 'forest school' }),
      }),
    )
  })

  it('409s on a duplicate subject in the same school', async () => {
    prismaMock.subjectReminder.findUnique.mockResolvedValue({ id: 'existing' })
    const res = await request(makeApp()).post('/api/schedule/reminders').send({ subject: 'Swimming', emoji: '🏊', reminder: 'x' })
    expect(res.status).toBe(409)
    expect(prismaMock.subjectReminder.create).not.toHaveBeenCalled()
  })

  it('400s when a required field is missing', async () => {
    const res = await request(makeApp()).post('/api/schedule/reminders').send({ subject: 'Swimming', emoji: '🏊' })
    expect(res.status).toBe(400)
  })
})

describe('PUT/DELETE /api/schedule/reminders/:id — tenant scoping', () => {
  it('404s on PUT when the row is not in the caller\'s school', async () => {
    prismaMock.subjectReminder.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).put('/api/schedule/reminders/other-school-row').send({ reminder: 'hijack' })
    expect(res.status).toBe(404)
    expect(prismaMock.subjectReminder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'other-school-row', schoolId: 'school-1' }) }),
    )
    expect(prismaMock.subjectReminder.update).not.toHaveBeenCalled()
  })

  it('scopes DELETE by schoolId and 404s when nothing was deleted', async () => {
    prismaMock.subjectReminder.deleteMany.mockResolvedValue({ count: 0 })
    const res = await request(makeApp()).delete('/api/schedule/reminders/row-x')
    expect(res.status).toBe(404)
    expect(prismaMock.subjectReminder.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'row-x', schoolId: 'school-1' }) }),
    )
  })
})
