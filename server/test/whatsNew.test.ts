import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * "What's new" for parents: told once about a feature that launched, in their
 * language, and never about one that was already there when they joined, that
 * their school has switched off, or while an emergency alert is running.
 */

const prismaMock = {
  user: { findUnique: vi.fn() },
  school: { findUnique: vi.fn() },
  parentReleaseSeen: { findMany: vi.fn(), createMany: vi.fn() },
  emergencyAlert: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
const translateMock = vi.fn(async (t: string[]) => t.map(x => `[ar] ${x}`))
vi.mock('../src/services/translation', () => ({ translateTexts: translateMock }))

let user: Record<string, unknown> = {}
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: express.Request & { user?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.user = user
    next()
  },
}))

const { unseenReleases } = await import('../src/services/parentReleases')
const { default: whatsNewRoutes } = await import('../src/routes/whatsNew')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/whats-new', whatsNewRoutes)
  return app
}

const NOW = new Date('2026-11-12T09:00:00Z')
const R = (id: string, date: string, over: Record<string, unknown> = {}) =>
  ({ id, date, title: id, blurb: 'b', icon: 'sparkles' as const, ...over })
const LONG_AGO = new Date('2025-01-01T00:00:00Z')

describe('which entries a parent is shown', () => {
  const who = { joinedAt: LONG_AGO, school: { postsEnabled: true } }

  it('shows recent entries, newest first, and not ones already seen', () => {
    const list = [R('a', '2026-11-01'), R('b', '2026-11-10'), R('c', '2026-11-05')]
    expect(unseenReleases(who, ['c'], NOW, list).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('leaves out an entry older than the account: it was never new to them', () => {
    const list = [R('before', '2026-11-01'), R('same-day', '2026-11-05'), R('after', '2026-11-08')]
    const joined = { ...who, joinedAt: new Date('2026-11-05T15:00:00Z') }
    expect(unseenReleases(joined, [], NOW, list).map(r => r.id)).toEqual(['after'])
  })

  it('leaves out an entry once it is old news, and one not yet launched', () => {
    const list = [R('old', '2026-09-01'), R('future', '2026-12-01'), R('now', '2026-11-11')]
    expect(unseenReleases(who, [], NOW, list).map(r => r.id)).toEqual(['now'])
  })

  it('leaves out a feature in a module the school has switched off', () => {
    const list = [R('posts', '2026-11-10', { requires: 'postsEnabled' })]
    expect(unseenReleases({ ...who, school: { postsEnabled: false } }, [], NOW, list)).toEqual([])
    expect(unseenReleases(who, [], NOW, list).map(r => r.id)).toEqual(['posts'])
  })

  it('shows at most three at once', () => {
    const list = ['1', '2', '3', '4'].map(d => R(d, `2026-11-0${d}`))
    expect(unseenReleases(who, [], NOW, list)).toHaveLength(3)
  })
})

describe('GET /api/whats-new', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    user = { id: 'p-1', schoolId: 's-1', role: 'PARENT' }
    prismaMock.user.findUnique.mockResolvedValue({ createdAt: LONG_AGO, preferredLanguage: 'en' })
    prismaMock.school.findUnique.mockResolvedValue({ postsEnabled: true, inboxEnabled: true, formsEnabled: true, eventsEnabled: true })
    prismaMock.parentReleaseSeen.findMany.mockResolvedValue([])
    prismaMock.emergencyAlert.findFirst.mockResolvedValue(null)
  })

  it('announces the posts features to a parent who has not seen them', async () => {
    const res = await request(makeApp()).get('/api/whats-new')
    expect(res.body.map((r: { id: string }) => r.id)).toEqual(['2026-11-hide-posts', '2026-11-unpin-posts'])
  })

  it('says nothing while the school has an emergency alert running', async () => {
    prismaMock.emergencyAlert.findFirst.mockResolvedValue({ id: 'alert-1' })
    const res = await request(makeApp()).get('/api/whats-new')
    expect(res.body).toEqual([])
    expect(prismaMock.emergencyAlert.findFirst.mock.calls[0][0].where).toEqual({ schoolId: 's-1', status: 'ACTIVE' })
  })

  it("speaks the parent's language", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ createdAt: LONG_AGO, preferredLanguage: 'ar' })
    const res = await request(makeApp()).get('/api/whats-new')
    expect(res.body[0].title).toBe("[ar] Hide posts you don't need")
    expect(res.body[0].id).toBe('2026-11-hide-posts')
  })

  it('is empty for an admin, who never opens the parent app', async () => {
    user = { id: 'a-1', schoolId: 's-1', role: 'ADMIN' }
    const res = await request(makeApp()).get('/api/whats-new')
    expect(res.body).toEqual([])
  })
})

describe('POST /api/whats-new/seen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    user = { id: 'p-1', schoolId: 's-1', role: 'PARENT' }
  })

  it('records what the parent closed, once, and ignores ids not in the code', async () => {
    prismaMock.parentReleaseSeen.createMany.mockResolvedValue({ count: 1 })
    const res = await request(makeApp())
      .post('/api/whats-new/seen')
      .send({ ids: ['2026-11-hide-posts', '2026-11-hide-posts', 'made-up'] })
    expect(res.body).toEqual({ recorded: 1 })
    expect(prismaMock.parentReleaseSeen.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'p-1', releaseId: '2026-11-hide-posts' }],
      skipDuplicates: true,
    })
  })
})
