import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// POST /api/parent-invitations/send-invites with Prisma + auth + email mocked.
// The auth mock stamps a school-scoped admin (school-A).
const prismaMock = {
  user: { findMany: vi.fn(), updateMany: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const sendParentWelcomeEmail = vi.fn(async () => true)
vi.mock('../src/services/email', () => ({ sendParentWelcomeEmail }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
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
})

describe('POST /api/parent-invitations/send-invites', () => {
  it('emails every school parent with an email, skips those without, stamps welcomeSentAt', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p-1', email: 'a@example.com', name: 'A' },
      { id: 'p-2', email: null, name: 'B' },
      { id: 'p-3', email: 'c@example.com', name: 'C' },
    ])

    const res = await request(await makeApp()).post('/api/parent-invitations/send-invites').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: 2, skipped: 1 })

    expect(sendParentWelcomeEmail).toHaveBeenCalledTimes(2)
    expect(sendParentWelcomeEmail).toHaveBeenCalledWith({ to: 'a@example.com', schoolName: 'VHPS' })
    expect(sendParentWelcomeEmail).toHaveBeenCalledWith({ to: 'c@example.com', schoolName: 'VHPS' })

    // Only the emailed parents get welcomeSentAt stamped.
    expect(prismaMock.user.updateMany).toHaveBeenCalledTimes(1)
    const call = prismaMock.user.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: { in: ['p-1', 'p-3'] } })
    expect(call.data.welcomeSentAt).toBeInstanceOf(Date)
  })

  it('is tenant-scoped: queries only PARENT users in the caller school', async () => {
    prismaMock.user.findMany.mockResolvedValue([])

    await request(await makeApp()).post('/api/parent-invitations/send-invites').send({})

    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('school-A')
    expect(where.role).toBe('PARENT')
  })

  it('scopes to the passed parentUserIds when provided', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'p-9', email: 'z@example.com', name: 'Z' }])

    const res = await request(await makeApp())
      .post('/api/parent-invitations/send-invites')
      .send({ parentUserIds: ['p-9'] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: 1, skipped: 0 })
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where).toEqual({ schoolId: 'school-A', role: 'PARENT', id: { in: ['p-9'] } })
  })
})
