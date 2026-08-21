import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// CRUD guards for the term-dates route with Prisma + auth + audit mocked. The
// focus is the Hub read-only enforcement: Hub-sourced rows (hubTermId non-null)
// reject PUT/DELETE with a 400; manual rows (hubTermId null) stay editable; and
// GET exposes `fromHub`.
const prismaMock = {
  termDate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-1' }
    next()
  }
  return { isAuthenticated: setUser, isAdmin: setUser, loadUserWithRelations: vi.fn() }
})

vi.mock('../src/services/audit', () => ({
  logAudit: vi.fn(),
  computeChanges: vi.fn(() => ({})),
}))

async function makeApp() {
  const { default: router } = await import('../src/routes/termDates')
  const app = express()
  app.use(express.json())
  app.use('/api/term-dates', router)
  return app
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'td-1',
  term: 1,
  termName: 'Autumn Term',
  label: 'Autumn Term starts',
  sublabel: null,
  date: new Date('2026-08-31T00:00:00.000Z'),
  endDate: null,
  type: 'term-start',
  color: 'green',
  academicYear: '2026/27',
  hubTermId: null,
  schoolId: 'school-1',
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('GET /api/term-dates', () => {
  it('serialises fromHub = (hubTermId != null) for each row', async () => {
    prismaMock.termDate.findMany.mockResolvedValue([
      row({ id: 'manual', hubTermId: null }),
      row({ id: 'hub', hubTermId: 'ht-1' }),
    ])
    const res = await request(await makeApp()).get('/api/term-dates')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      expect.objectContaining({ id: 'manual', fromHub: false }),
      expect.objectContaining({ id: 'hub', fromHub: true }),
    ])
  })
})

describe('PUT /api/term-dates/:id', () => {
  const payload = {
    term: 1, termName: 'Autumn Term', label: 'x', date: '2026-08-31',
    type: 'term-start', color: 'green', academicYear: '2026/27',
  }

  it('rejects (400) editing a Hub-sourced row and never writes', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(row({ hubTermId: 'ht-1' }))
    const res = await request(await makeApp()).put('/api/term-dates/td-1').send(payload)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'This term date is managed in Wasil Hub' })
    expect(prismaMock.termDate.update).not.toHaveBeenCalled()
  })

  it('allows editing a manual (hubTermId null) row', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(row({ hubTermId: null }))
    prismaMock.termDate.update.mockResolvedValue(row({ label: 'x' }))
    const res = await request(await makeApp()).put('/api/term-dates/td-1').send(payload)
    expect(res.status).toBe(200)
    expect(prismaMock.termDate.update).toHaveBeenCalledTimes(1)
  })

  it('404s when the row is not found for this school', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(null)
    const res = await request(await makeApp()).put('/api/term-dates/nope').send(payload)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/term-dates/:id', () => {
  it('rejects (400) deleting a Hub-sourced row and never deletes', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(row({ hubTermId: 'ht-1' }))
    const res = await request(await makeApp()).delete('/api/term-dates/td-1')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'This term date is managed in Wasil Hub' })
    expect(prismaMock.termDate.delete).not.toHaveBeenCalled()
  })

  it('allows deleting a manual (hubTermId null) row', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(row({ hubTermId: null }))
    prismaMock.termDate.delete.mockResolvedValue(row())
    const res = await request(await makeApp()).delete('/api/term-dates/td-1')
    expect(res.status).toBe(200)
    expect(prismaMock.termDate.delete).toHaveBeenCalledWith({ where: { id: 'td-1' } })
  })

  it('404s when the row is not found for this school', async () => {
    prismaMock.termDate.findFirst.mockResolvedValue(null)
    const res = await request(await makeApp()).delete('/api/term-dates/nope')
    expect(res.status).toBe(404)
    expect(prismaMock.termDate.delete).not.toHaveBeenCalled()
  })
})
