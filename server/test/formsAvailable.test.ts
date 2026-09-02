import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/forms/available — what the post composer can attach.
 *
 * The dropdown was empty for staff and nobody could tell why: the route was
 * admin-only while posting is staff-allowed, so the client turned a 403 into
 * "this school has no forms". These tests pin the permission and the reason
 * for a short list.
 */
const prismaMock = {
  form: { findMany: vi.fn(), count: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))

let role = 'STAFF'
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'u-1', schoolId: 'school-1', role }
    next()
  }
  const gate = (allowed: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!allowed.includes(role)) return res.status(403).json({ error: 'Forbidden' })
      return attach(req, res, next)
    }
  return {
    isAuthenticated: attach,
    isStaff: gate(['STAFF', 'ADMIN', 'SUPER_ADMIN']),
    isAdmin: gate(['ADMIN', 'SUPER_ADMIN']),
    loadUserWithRelations: vi.fn(),
  }
})

const { default: formsRoutes } = await import('../src/routes/forms')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/forms', formsRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  role = 'STAFF'
  prismaMock.form.findMany.mockResolvedValue([])
  prismaMock.form.count.mockResolvedValue(0)
})

describe('GET /api/forms/available', () => {
  // The original bug: posting is isStaff, this was isAdmin, and the client
  // swallowed the 403 into an empty dropdown.
  it('is available to staff, who are the people composing posts', async () => {
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.status).toBe(200)
  })

  it('is still available to admins', async () => {
    role = 'ADMIN'
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.status).toBe(200)
  })

  it('offers only drafts that are not already on a post', async () => {
    await request(makeApp()).get('/api/forms/available')
    expect(prismaMock.form.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-1', status: 'DRAFT', message: null },
      }),
    )
  })

  it('returns the forms that can be attached', async () => {
    prismaMock.form.findMany.mockResolvedValue([
      { id: 'f-1', title: 'Trip consent', type: 'CONSENT', status: 'DRAFT', fields: [], createdAt: new Date(), updatedAt: new Date(), classIds: [], yearGroupIds: [] },
    ])
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.body.forms).toHaveLength(1)
    expect(res.body.forms[0].title).toBe('Trip consent')
  })

  // "No forms" and "four forms, all published" look identical in a dropdown,
  // and only one of them is the user's fault.
  it('says how many forms exist but are excluded, and why', async () => {
    prismaMock.form.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)

    const res = await request(makeApp()).get('/api/forms/available')

    expect(res.body.forms).toEqual([])
    expect(res.body.unavailable).toEqual({ published: 3, alreadyAttached: 2 })
  })

  it('counts a genuinely empty school as zero excluded, not as an error', async () => {
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.body).toEqual({ forms: [], unavailable: { published: 0, alreadyAttached: 0 } })
  })
})
