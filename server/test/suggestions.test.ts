import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The suggestion box, and the one promise it makes.
 *
 * "Anonymous" has to mean anonymous, including to us. A parent deciding whether
 * to say something uncomfortable about the school is making that decision on
 * the strength of one sentence in the app, and every test below exists because
 * a plausible implementation would have quietly broken it:
 *
 *   • storing authorId "just for moderation"
 *   • storing a hash of it, which a school holding the user list can reverse by
 *     hashing all 400 parents
 *   • an exact timestamp, which is an identifier once you hold the rest of the
 *     app's logs — "who opened the app at 14:32" is often one family
 *   • an audit row, written by the very system that promised there was none
 *   • a rate-limit row joined to the suggestion, which turns "how many did they
 *     send" into "which one was theirs"
 *
 * The honest boundary, stated so nobody promises more later: someone with raw
 * database access can learn THAT a parent sent something on a given day. They
 * cannot learn WHICH. No screen reveals even that.
 */

const prismaMock = {
  school: { findUnique: vi.fn() },
  suggestion: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  suggestionQuota: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
const logAudit = vi.fn(async () => undefined)
vi.mock('../src/services/audit', () => ({ logAudit, computeChanges: vi.fn(() => null) }))

let role = 'PARENT'
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'parent-1', schoolId: 'sch-1', role, name: 'A Parent',
    }
    next()
  }
  return { isAuthenticated: attach, isAdmin: attach, isStaff: attach, loadUserWithRelations: vi.fn() }
})

const { default: suggestionRoutes } = await import('../src/routes/suggestions')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/suggestions', suggestionRoutes)
  return app
}

const send = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/suggestions').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  role = 'PARENT'
  prismaMock.school.findUnique.mockResolvedValue({ suggestionsEnabled: true, timezone: 'Asia/Dubai' })
  prismaMock.suggestionQuota.upsert.mockResolvedValue({ count: 1 })
  prismaMock.suggestion.create.mockResolvedValue({ id: 's-1' })
})

describe('an anonymous suggestion', () => {
  it('stores NO author', async () => {
    const res = await send({ body: 'More bike racks please', anonymous: true })

    expect(res.status).toBe(201)
    const data = prismaMock.suggestion.create.mock.calls[0][0].data
    expect(data.authorId).toBeNull()
  })

  it('stores nothing else that could identify them', async () => {
    // Not a hash, not an IP, not a device id. A school holding the user list
    // can reverse a hash by hashing all 400 parents, so "hashed" is not a
    // defence against the only adversary that matters here.
    await send({ body: 'The gate is chaotic at 3pm', anonymous: true })

    const data = prismaMock.suggestion.create.mock.calls[0][0].data
    const keys = Object.keys(data).sort()
    expect(keys).toEqual(['authorId', 'body', 'category', 'createdAt', 'schoolId'])
  })

  it('rounds the timestamp to the hour', async () => {
    // An exact time is an identifier once you hold the rest of the app's logs.
    // "Who opened the app at 14:32" is a short list, and in a small school it
    // is often one family.
    await send({ body: 'x', anonymous: true })

    const createdAt = prismaMock.suggestion.create.mock.calls[0][0].data.createdAt as Date
    expect(createdAt.getUTCMinutes()).toBe(0)
    expect(createdAt.getUTCSeconds()).toBe(0)
    expect(createdAt.getUTCMilliseconds()).toBe(0)
  })

  it('writes NO audit row', async () => {
    // An audit row carries the actor, the time and the resource id — which is
    // a join back to the suggestion, written by the system that just promised
    // there was none.
    await send({ body: 'x', anonymous: true })

    expect(logAudit).not.toHaveBeenCalled()
  })

  it('is invisible to the school as an author', async () => {
    role = 'ADMIN'
    prismaMock.suggestion.findMany.mockResolvedValue([
      { id: 's-1', body: 'x', category: null, status: 'NEW', adminNote: null,
        createdAt: new Date(), handledAt: null, author: null, handledBy: null },
    ])

    const res = await request(makeApp()).get('/api/suggestions')

    expect(res.body[0].fromName).toBeNull()
    expect(res.body[0].canReply).toBe(false)
    // No id of any kind reaches the client — there is nothing to look up.
    expect(JSON.stringify(res.body)).not.toContain('parent-1')
  })
})

describe('a signed suggestion', () => {
  it('keeps the author, so the school can reply', async () => {
    await send({ body: 'Could we have a second bike rack?', anonymous: false })

    expect(prismaMock.suggestion.create.mock.calls[0][0].data.authorId).toBe('parent-1')
  })

  it('keeps the exact time — there is nothing to protect', async () => {
    await send({ body: 'x', anonymous: false })

    const createdAt = prismaMock.suggestion.create.mock.calls[0][0].data.createdAt as Date
    // Rounding a signed suggestion would be pointless ceremony, and would make
    // the two kinds look alike in a way that helps nobody.
    expect(createdAt.getUTCMinutes()).not.toBe(0)
  })

  it('shows the name to the school', async () => {
    role = 'ADMIN'
    prismaMock.suggestion.findMany.mockResolvedValue([
      { id: 's-1', body: 'x', category: null, status: 'NEW', adminNote: null,
        createdAt: new Date(), handledAt: null,
        author: { id: 'parent-1', name: 'Sonia Rahim' }, handledBy: null },
    ])

    const res = await request(makeApp()).get('/api/suggestions')

    expect(res.body[0].fromName).toBe('Sonia Rahim')
    expect(res.body[0].canReply).toBe(true)
  })
})

describe('the choice itself', () => {
  it('refuses to guess when anonymity is not stated', async () => {
    // A default here is a decision made for somebody about whether they can be
    // identified, made silently, by whoever wrote that line.
    const res = await send({ body: 'Something I would rather not sign' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/with your name or anonymously/i)
    expect(prismaMock.suggestion.create).not.toHaveBeenCalled()
  })

  it('refuses a non-boolean rather than coercing it', async () => {
    const res = await send({ body: 'x', anonymous: 'yes' })
    expect(res.status).toBe(400)
    expect(prismaMock.suggestion.create).not.toHaveBeenCalled()
  })
})

describe('the rate limit, which must not become a join', () => {
  it('counts per parent per day and holds no reference to the suggestion', async () => {
    await send({ body: 'x', anonymous: true })

    const arg = prismaMock.suggestionQuota.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ userId_dayLocal: { userId: 'parent-1', dayLocal: expect.any(String) } })
    // No suggestionId, anywhere. "How many did they send" must never become
    // "which one was theirs".
    expect(JSON.stringify(arg)).not.toContain('suggestionId')
  })

  it('counts the day in the SCHOOL timezone, not UTC', async () => {
    // A parent's "today" is the school's day. At UTC+4 a suggestion sent at
    // 1am would otherwise count against yesterday.
    await send({ body: 'x', anonymous: true })

    expect(prismaMock.school.findUnique).toHaveBeenCalledWith({
      where: { id: 'sch-1' },
      select: { suggestionsEnabled: true, timezone: true },
    })
  })

  it('stops the sixth of the day', async () => {
    prismaMock.suggestionQuota.upsert.mockResolvedValue({ count: 6 })

    const res = await send({ body: 'x', anonymous: true })

    expect(res.status).toBe(429)
    expect(prismaMock.suggestion.create).not.toHaveBeenCalled()
  })
})

describe('when the box is shut', () => {
  it('404s for a school that has not switched it on', async () => {
    // Not 403. A school that has not adopted this has no such feature, and
    // saying "forbidden" implies one exists that they are shut out of.
    prismaMock.school.findUnique.mockResolvedValue({ suggestionsEnabled: false, timezone: 'Asia/Dubai' })

    const res = await send({ body: 'x', anonymous: true })

    expect(res.status).toBe(404)
    expect(prismaMock.suggestion.create).not.toHaveBeenCalled()
  })

  it('reports whether it is open, so the menu can decide', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ suggestionsEnabled: false })
    const res = await request(makeApp()).get('/api/suggestions/enabled')
    expect(res.body).toEqual({ enabled: false })
  })

  it('refuses a member of staff — this is for parents and carers', async () => {
    role = 'STAFF'
    const res = await send({ body: 'x', anonymous: true })
    expect(res.status).toBe(403)
  })
})
