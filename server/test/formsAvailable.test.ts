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
  form: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
const sendNotification = vi.fn()
vi.mock('../src/services/notify', () => ({ sendNotification }))
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
  const stamps = { createdAt: new Date('2026-09-17T09:00:00Z'), updatedAt: new Date('2026-09-17T09:00:00Z'), expiresAt: null }
  prismaMock.form.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'f-1', fields: [], classIds: [], yearGroupIds: [], ...stamps, ...data }))
  prismaMock.form.findFirst.mockResolvedValue({
    id: 'f-1', schoolId: 'school-1', status: 'DRAFT', title: 'Trip consent',
    fields: [], classIds: [], yearGroupIds: [], targetClass: 'Whole School', ...stamps,
  })
  prismaMock.form.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'f-1', schoolId: 'school-1', title: 'Trip consent',
      fields: [], classIds: [], yearGroupIds: [], targetClass: 'Whole School', ...stamps, ...data }))
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

  // A draft is a first send; an active form can go out again on a reminder,
  // which is most of the reason to attach one. Only closed is withheld.
  it('offers drafts and active forms, never closed ones', async () => {
    await request(makeApp()).get('/api/forms/available')
    expect(prismaMock.form.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-1', status: { in: ['DRAFT', 'ACTIVE'] } },
      }),
    )
  })

  it('offers a form that is already on another post', async () => {
    // Message.formId is no longer unique, so being attached elsewhere is not
    // a reason to withhold it — that is what a reminder post is.
    prismaMock.form.findMany.mockResolvedValue([
      { id: 'f-1', title: 'Trip consent', type: 'CONSENT', status: 'ACTIVE', fields: [], createdAt: new Date(), updatedAt: new Date(), classIds: [], yearGroupIds: [] },
    ])
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.body.forms).toHaveLength(1)
    expect(res.body.forms[0].status).toBe('ACTIVE')
  })

  it('returns the forms that can be attached', async () => {
    prismaMock.form.findMany.mockResolvedValue([
      { id: 'f-1', title: 'Trip consent', type: 'CONSENT', status: 'DRAFT', fields: [], createdAt: new Date(), updatedAt: new Date(), classIds: [], yearGroupIds: [] },
    ])
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.body.forms).toHaveLength(1)
    expect(res.body.forms[0].title).toBe('Trip consent')
  })

  // "You have none" and "yours are all finished" are the same empty dropdown
  // and different problems.
  it('says how many forms are closed when the list is empty', async () => {
    prismaMock.form.count.mockResolvedValue(4)

    const res = await request(makeApp()).get('/api/forms/available')

    expect(res.body.forms).toEqual([])
    expect(res.body.unavailable).toEqual({ closed: 4 })
  })

  it('a genuinely empty school reports zero closed, not an error', async () => {
    const res = await request(makeApp()).get('/api/forms/available')
    expect(res.body).toEqual({ forms: [], unavailable: { closed: 0 } })
  })
})

/**
 * A form does not announce itself.
 *
 * It is attached to a post, and the post is the announcement — it carries the
 * words explaining what is being asked and why. Creating the form fired its own
 * notification too, so a parent got two: one reading "New Form" with no
 * context, then the post that actually explained it.
 *
 * Nothing covered this, which is how it survived. These tests exist so the
 * absence of a send is a stated intention rather than something that looks like
 * an oversight to the next person reading the route.
 */
describe('creating a form', () => {
  const body = {
    title: 'Trip consent', type: 'trip-consent', targetClass: 'Whole School', status: 'ACTIVE',
  }

  it('sends nothing, even when created ACTIVE', async () => {
    role = 'ADMIN'
    const res = await request(makeApp()).post('/api/forms').send(body)

    expect(res.status).toBe(201)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends nothing when a draft is later activated', async () => {
    role = 'ADMIN'
    const res = await request(makeApp()).put('/api/forms/f-1').send({ ...body, status: 'ACTIVE' })

    expect(res.status).toBe(200)
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
