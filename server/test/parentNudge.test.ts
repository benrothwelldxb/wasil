import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// POST /api/parent-invitations/nudge — chasing parents who never signed in.
const prismaMock = {
  user: { findMany: vi.fn(), updateMany: vi.fn() },
  school: { findUnique: vi.fn() },
  message: { count: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const sendParentNudgeEmail = vi.fn(async () => true)
vi.mock('../src/services/email', () => ({ sendParentNudgeEmail, sendParentWelcomeEmail: vi.fn(async () => true) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

// Who has signed in is decided by the shared activation service; here it is
// driven directly so each test states its own roster.
const parentsBySignInStatus = vi.fn()
vi.mock('../src/services/parentActivation', () => ({
  parentsBySignInStatus,
  activatedParentIds: vi.fn(async () => new Set<string>()),
}))

vi.mock('../src/middleware/auth', () => {
  const setAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-A' }
    next()
  }
  return { isAuthenticated: setAdmin, isAdmin: setAdmin, loadUserWithRelations: vi.fn() }
})

async function makeApp() {
  const { default: router } = await import('../src/routes/parentInvitations')
  const app = express()
  app.use(express.json())
  app.use('/api/parent-invitations', router)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ name: 'VHPS' })
  prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.message.count.mockResolvedValue(12)
})

describe('POST /api/parent-invitations/nudge', () => {
  it('chases everyone who has never signed in when no ids are given', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set(['p-in']),
      neverSignedIn: new Set(['p-1', 'p-2']),
    })
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p-1', email: 'a@example.com' },
      { id: 'p-2', email: 'b@example.com' },
    ])

    const res = await request(await makeApp()).post('/api/parent-invitations/nudge').send({})

    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(2)
    expect(sendParentNudgeEmail).toHaveBeenCalledTimes(2)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastNudgedAt: expect.any(Date) } }),
    )
  })

  // The whole point of recomputing server-side: an admin leaves the page open,
  // the parent signs in, the admin clicks Nudge. Nothing should go out.
  it('will not email a parent who has signed in since the page was loaded', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set(['p-1']),
      neverSignedIn: new Set<string>(),
    })

    const res = await request(await makeApp())
      .post('/api/parent-invitations/nudge')
      .send({ parentUserIds: ['p-1'] })

    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(0)
    expect(res.body.skippedAlreadySignedIn).toBe(1)
    expect(sendParentNudgeEmail).not.toHaveBeenCalled()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('narrows to the ids asked for, and only those still never signed in', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set(['p-2']),
      neverSignedIn: new Set(['p-1', 'p-3']),
    })
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p-1', email: 'a@example.com' }])

    const res = await request(await makeApp())
      .post('/api/parent-invitations/nudge')
      .send({ parentUserIds: ['p-1', 'p-2'] })

    expect(res.body.sent).toBe(1)
    // p-3 never signed in but was not asked for; p-2 was asked for but is in.
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['p-1'] } }) }),
    )
  })

  it('skips a parent with no email rather than failing the batch', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set<string>(),
      neverSignedIn: new Set(['p-1', 'p-2']),
    })
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p-1', email: null },
      { id: 'p-2', email: 'b@example.com' },
    ])

    const res = await request(await makeApp()).post('/api/parent-invitations/nudge').send({})

    expect(res.body).toMatchObject({ sent: 1, skippedNoEmail: 1 })
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p-2'] } } }),
    )
  })

  it('tells the parent how much they have missed', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set<string>(),
      neverSignedIn: new Set(['p-1']),
    })
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p-1', email: 'a@example.com' }])

    await request(await makeApp()).post('/api/parent-invitations/nudge').send({})

    expect(sendParentNudgeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.com', schoolName: 'VHPS', missedCount: 12 }),
    )
  })

  it('does nothing, successfully, when everyone has signed in', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set(['p-1']),
      neverSignedIn: new Set<string>(),
    })

    const res = await request(await makeApp()).post('/api/parent-invitations/nudge').send({})

    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(0)
    expect(sendParentNudgeEmail).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  // Test Parents have fake mailboxes and must never be emailed, even if an
  // explicit id list names one.
  it('excludes Test Parents at the query', async () => {
    parentsBySignInStatus.mockResolvedValue({
      signedIn: new Set<string>(),
      neverSignedIn: new Set(['p-1']),
    })
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p-1', email: 'a@example.com' }])

    await request(await makeApp()).post('/api/parent-invitations/nudge').send({})

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isTest: false, schoolId: 'school-A' }) }),
    )
  })
})
