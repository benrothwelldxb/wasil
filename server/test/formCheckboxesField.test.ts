import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// The 'checkboxes' field type — "tick all that apply".
//
// Distinct from 'checkbox', which is ONE box answered with a boolean. A group is
// answered with an ARRAY of the chosen option labels, and that difference is the
// whole reason this needs its own tests: the required-field check was written
// for scalars, so an empty array ([] — nothing ticked) sails past every one of
// `undefined`, `''` and `null`. A required question that silently accepts no
// answer is worse than no validation at all. Prisma is mocked.

const prismaMock = {
  form: { findFirst: vi.fn() },
  formResponse: { upsert: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))

vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'p-1', role: 'PARENT', schoolId: 'school-1', name: 'Sara Khan',
    }
    next()
  }
  return { isAuthenticated: setUser, isStaff: setUser, isAdmin: setUser, loadUserWithRelations: vi.fn() }
})

const { default: formsRoutes } = await import('../src/routes/forms')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/forms', formsRoutes)
  return app
}

const TRIPS = {
  id: 'f-trips',
  schoolId: 'school-1',
  status: 'ACTIVE',
  fields: [
    { id: 'q1', type: 'checkboxes', label: 'Which trips', required: true, options: ['Zoo', 'Museum', 'Farm'] },
  ],
}

const respond = (answers: unknown) =>
  request(makeApp()).post('/api/forms/f-trips/respond').send({ answers })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.form.findFirst.mockResolvedValue(TRIPS)
  prismaMock.formResponse.upsert.mockResolvedValue({
    id: 'r-1', answers: { q1: ['Zoo'] }, createdAt: new Date('2026-08-31T09:00:00.000Z'),
  })
})

describe('POST /api/forms/:id/respond — checkboxes', () => {
  it('stores every ticked option, in order', async () => {
    const res = await respond({ q1: ['Zoo', 'Farm'] })
    expect(res.status).toBe(200)
    expect(prismaMock.formResponse.upsert.mock.calls[0][0].create.answers).toEqual({ q1: ['Zoo', 'Farm'] })
  })

  it('rejects a required group with nothing ticked — [] is NOT an answer', async () => {
    const res = await respond({ q1: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Which trips')
    expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
  })

  it('rejects a required group that is missing entirely', async () => {
    expect((await respond({})).status).toBe(400)
    expect(prismaMock.formResponse.upsert).not.toHaveBeenCalled()
  })

  it('accepts one tick', async () => {
    expect((await respond({ q1: ['Museum'] })).status).toBe(200)
  })

  it('lets an OPTIONAL group through with nothing ticked', async () => {
    prismaMock.form.findFirst.mockResolvedValue({
      ...TRIPS,
      fields: [{ ...TRIPS.fields[0], required: false }],
    })
    expect((await respond({ q1: [] })).status).toBe(200)
  })

  it('leaves the single-checkbox type alone — false is still a rejected required answer', async () => {
    prismaMock.form.findFirst.mockResolvedValue({
      ...TRIPS,
      fields: [{ id: 'q1', type: 'checkbox', label: 'I consent', required: true }],
    })
    // A boolean field keeps the scalar rules: undefined/''/null are rejected...
    expect((await respond({})).status).toBe(400)
    // ...and a tick is accepted.
    expect((await respond({ q1: true })).status).toBe(200)
  })
})
