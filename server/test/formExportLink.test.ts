import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The public CSV link — the one pasted into a Google Sheet as
 * =IMPORTDATA("..."), so the sheet shows responses as they arrive.
 *
 * It used to stop working after 24 hours. Nothing in the admin screen said so,
 * and the sheet does not announce it either: IMPORTDATA on a 403 simply stops
 * updating, so a coordinator sees yesterday's responses and concludes nobody
 * has replied since. A link that dies quietly is worse than one that was never
 * offered.
 *
 * Control now comes from the link EXISTING rather than from its age — nothing
 * until someone creates one, Regenerate to invalidate the old URL, Revoke to
 * remove it. Those are levers a person holds, rather than a timer they were
 * never told about. These tests exist because there were none, which is how a
 * silent expiry survived in a feature whose entire purpose it defeats.
 */

const prismaMock = {
  form: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'u-1', schoolId: 'school-1', role: 'ADMIN' }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: formsRoutes } = await import('../src/routes/forms')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/forms', formsRoutes)
  return app
}

const TOKEN = 'a'.repeat(64)

/** A form whose link was created `daysAgo` days ago. */
const formAged = (daysAgo: number) => ({
  id: 'f-1',
  title: 'Trip consent',
  schoolId: 'school-1',
  exportToken: TOKEN,
  exportTokenCreatedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  fields: [{ id: 'q1', label: 'Consent given', type: 'checkbox' }],
  responses: [
    {
      id: 'r-1',
      answers: { q1: true },
      createdAt: new Date('2026-09-17T09:00:00Z'),
      user: { name: 'Sadia Tegally', email: 'parent@example.com', children: [], studentLinks: [] },
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/forms/public-export/:token', () => {
  it('serves the responses as CSV', async () => {
    prismaMock.form.findUnique.mockResolvedValue(formAged(0))

    const res = await request(makeApp()).get(`/api/forms/public-export/${TOKEN}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('Sadia Tegally')
  })

  // The bug. A sheet is set up once and expected to keep working; 25 hours
  // later it was returning 403 and the sheet just stopped changing.
  it('still works long after the link was created', async () => {
    prismaMock.form.findUnique.mockResolvedValue(formAged(400))

    const res = await request(makeApp()).get(`/api/forms/public-export/${TOKEN}`)

    expect(res.status).toBe(200)
    expect(res.text).toContain('Sadia Tegally')
  })

  // Google Sheets decides what it received from the content type. Served as
  // anything else — or from a host that answers unknown paths with index.html,
  // which is how the admin link was built until it pointed at the API — the
  // sheet imports a page of markup and shows it as rows.
  it('is served as CSV, inline, and uncached', async () => {
    prismaMock.form.findUnique.mockResolvedValue(formAged(0))

    const res = await request(makeApp()).get(`/api/forms/public-export/${TOKEN}`)

    expect(res.headers['content-type']).toContain('text/csv')
    // No attachment disposition: IMPORTDATA reads the body, it does not download.
    expect(res.headers['content-disposition']).toBeUndefined()
    expect(res.headers['cache-control']).toContain('no-cache')
    expect(res.text.startsWith('<')).toBe(false)
  })

  it('refuses an unknown token', async () => {
    prismaMock.form.findUnique.mockResolvedValue(null)

    const res = await request(makeApp()).get(`/api/forms/public-export/${'b'.repeat(64)}`)

    expect(res.status).toBe(404)
  })

  // Revocation is the control, so it has to be the thing that actually stops
  // it — a revoked token matches no form and the URL dies immediately.
  it('refuses a revoked link', async () => {
    prismaMock.form.findUnique.mockResolvedValue(null)

    const res = await request(makeApp()).get(`/api/forms/public-export/${TOKEN}`)

    expect(res.status).toBe(404)
    expect(prismaMock.form.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { exportToken: TOKEN } })
    )
  })

  it('refuses a token too short to be one', async () => {
    const res = await request(makeApp()).get('/api/forms/public-export/short')

    expect(res.status).toBe(400)
    expect(prismaMock.form.findUnique).not.toHaveBeenCalled()
  })
})

describe('the admin side of the link', () => {
  it('reports no link until one is created', async () => {
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', exportToken: null, exportTokenCreatedAt: null })

    const res = await request(makeApp()).get('/api/forms/f-1/export-token')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ hasExportToken: false, exportToken: null })
  })

  it('reports when the link was created, so its age is visible', async () => {
    const created = new Date('2026-09-17T09:00:00Z')
    prismaMock.form.findFirst.mockResolvedValue({ id: 'f-1', exportToken: TOKEN, exportTokenCreatedAt: created })

    const res = await request(makeApp()).get('/api/forms/f-1/export-token')

    expect(res.body.exportTokenCreatedAt).toBe(created.toISOString())
  })

  it('will not reach another school\'s form', async () => {
    prismaMock.form.findFirst.mockResolvedValue(null)

    const res = await request(makeApp()).get('/api/forms/f-elsewhere/export-token')

    expect(res.status).toBe(404)
    expect(prismaMock.form.findFirst.mock.calls[0][0].where).toMatchObject({ schoolId: 'school-1' })
  })
})
