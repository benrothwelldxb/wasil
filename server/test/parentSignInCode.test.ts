import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'

// Exercises the admin-issued one-time sign-in code:
//   - POST /api/parent-invitations/parents/:id/sign-in-code (mint endpoint)
//   - the shared createLoginCode() helper it reuses
// Prisma + auth + jwt + email + audit are mocked — no database. The auth mock
// stamps a school-scoped admin (school-A).
const prismaMock = {
  user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  loginCode: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/jwt', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(async () => 'refresh-token'),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))
vi.mock('../src/services/email', () => ({
  sendMagicLinkEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendLoginCodeEmail: vi.fn(async () => true),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/middleware/auth', () => {
  const setAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user: unknown }).user = { id: 'admin-1', schoolId: 'school-A' }
    next()
  }
  return { isAuthenticated: setAdmin, isAdmin: setAdmin, loadUserWithRelations: vi.fn() }
})

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

async function makeApp() {
  const { default: router } = await import('../src/routes/parentInvitations')
  const app = express()
  app.use(express.json())
  app.use('/api/parent-invitations', router)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.loginCode.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.loginCode.create.mockResolvedValue({ id: 'lc-1' })
})

describe('createLoginCode helper', () => {
  it('supersedes prior codes, stores only the hash, and sets the requested TTL', async () => {
    const { createLoginCode } = await import('../src/routes/auth')

    const before = Date.now()
    const { code, expiresAt } = await createLoginCode('Parent@Example.com', 24 * 60)

    // Plaintext returned to the caller, never persisted.
    expect(code).toMatch(/^\d{6}$/)

    // Prior codes for the lowercased email deleted first (single live code).
    expect(prismaMock.loginCode.deleteMany).toHaveBeenCalledWith({ where: { email: 'parent@example.com' } })

    // Only the SHA-256 hash is stored; email lowercased; attempts reset.
    expect(prismaMock.loginCode.create).toHaveBeenCalledTimes(1)
    const created = prismaMock.loginCode.create.mock.calls[0][0].data
    expect(created.email).toBe('parent@example.com')
    expect(created.attempts).toBe(0)
    expect(created.codeHash).toBe(sha256(code))

    // 24-hour TTL.
    const ttl = expiresAt.getTime() - before
    expect(ttl).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000)
  })
})

describe('POST /api/parent-invitations/parents/:id/sign-in-code', () => {
  it('mints a 24h hashed LoginCode for the parent email and returns { code, expiresAt }', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'p-1', email: 'Parent@Example.com', schoolId: 'school-A', role: 'PARENT' })

    const before = Date.now()
    const res = await request(await makeApp()).post('/api/parent-invitations/parents/p-1/sign-in-code').send()

    expect(res.status).toBe(200)
    expect(res.body.code).toMatch(/^\d{6}$/)
    expect(typeof res.body.expiresAt).toBe('string')

    // Scoped lookup: parent in caller school.
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', schoolId: 'school-A', role: 'PARENT' },
    })

    // Superseded prior codes for the lowercased email, stored only the hash.
    expect(prismaMock.loginCode.deleteMany).toHaveBeenCalledWith({ where: { email: 'parent@example.com' } })
    const created = prismaMock.loginCode.create.mock.calls[0][0].data
    expect(created.email).toBe('parent@example.com')
    expect(created.codeHash).toBe(sha256(res.body.code))
    expect(created.codeHash).toMatch(/^[a-f0-9]{64}$/)

    // ~24-hour TTL.
    const ttl = new Date(res.body.expiresAt).getTime() - before
    expect(ttl).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000)
  })

  it('404s for a non-parent (e.g. a STAFF/admin user) — findFirst returns null', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await request(await makeApp()).post('/api/parent-invitations/parents/staff-1/sign-in-code').send()

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Parent not found')
    expect(prismaMock.loginCode.create).not.toHaveBeenCalled()
  })

  it("404s for a parent in another school (scoped by the caller's schoolId)", async () => {
    // findFirst is filtered by schoolId: 'school-A', so another school's user
    // never matches and returns null → 404 (no cross-tenant mint or probe).
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await request(await makeApp()).post('/api/parent-invitations/parents/other-school-parent/sign-in-code').send()

    expect(res.status).toBe(404)
    const where = prismaMock.user.findFirst.mock.calls[0][0].where
    expect(where.schoolId).toBe('school-A')
    expect(where.role).toBe('PARENT')
    expect(prismaMock.loginCode.create).not.toHaveBeenCalled()
  })
})
