import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'

// Fast unit coverage of the passwordless 6-digit sign-in (/auth/code/request +
// verify) with the data + token + email + audit layers mocked — no database.
// The ATOMIC/concurrency guarantees are proven separately against real Postgres
// in test/integration/authCode.itest.ts; here we cover the branch logic.

const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  loginCode: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  parentStudentLink: { findMany: vi.fn() },
  child: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/jwt', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(async () => 'refresh-token'),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))
const sendLoginCodeEmail = vi.fn(async () => true)
vi.mock('../src/services/email', () => ({
  sendMagicLinkEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendLoginCodeEmail,
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
// Auth audit is DB-backed; stub it. AUTH_EVENT is referenced by name, so a
// Proxy that echoes the key is enough.
const logAuthEvent = vi.fn(async () => {})
vi.mock('../src/services/authAudit', () => ({
  logAuthEvent,
  AUTH_EVENT: new Proxy({}, { get: (_t, p) => String(p) }),
}))
// Make the rate-limit store a no-op so the limiters fall back to the library's
// in-memory MemoryStore for these unit tests (the Postgres store is exercised
// in the integration suite).
vi.mock('../src/services/rateLimitStore', () => ({ prismaRateLimitStore: () => undefined }))

const { default: authRoutes } = await import('../src/routes/auth')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRoutes)
  return app
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.loginCode.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.loginCode.create.mockResolvedValue({ id: 'lc-1' })
  prismaMock.loginCode.count.mockResolvedValue(0)
  prismaMock.user.update.mockResolvedValue({})
})

describe('POST /auth/code/request', () => {
  it('returns 200 { ok: true } for an unknown email and mints nothing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(makeApp()).post('/auth/code/request').send({ email: 'nobody@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prismaMock.loginCode.create).not.toHaveBeenCalled()
    expect(sendLoginCodeEmail).not.toHaveBeenCalled()
  })

  it('mints a hashed ~10-minute code and emails it for a known email', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', email: 'known@example.com', schoolId: 'school-A', school: { id: 'school-A', name: 'VHPS' },
    })

    const before = Date.now()
    const res = await request(makeApp()).post('/auth/code/request').send({ email: 'Known@Example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    // Prior codes superseded, then a new one created for the lowercased email.
    expect(prismaMock.loginCode.deleteMany).toHaveBeenCalledWith({ where: { email: 'known@example.com' } })
    expect(prismaMock.loginCode.create).toHaveBeenCalledTimes(1)
    const created = prismaMock.loginCode.create.mock.calls[0][0].data
    expect(created.email).toBe('known@example.com')
    expect(created.attempts).toBe(0)
    // Only the hash is stored, never the plaintext.
    expect(created.codeHash).toMatch(/^[a-f0-9]{64}$/)
    const ttl = created.expiresAt.getTime() - before
    expect(ttl).toBeGreaterThan(9 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 5000)

    // The emailed plaintext hashes to the stored hash.
    const emailedCode = sendLoginCodeEmail.mock.calls[0][0].code
    expect(emailedCode).toMatch(/^\d{6}$/)
    expect(sha256(emailedCode)).toBe(created.codeHash)
  })

  it('rate-limits repeated requests for the same email (per-email limiter trips)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-2', email: 'spam@example.com', schoolId: 'school-A', school: { id: 'school-A', name: 'VHPS' },
    })
    const app = makeApp()

    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/auth/code/request').send({ email: 'spam@example.com' })
      statuses.push(r.status)
    }
    // First 3 pass (max: 3), the 4th trips the per-email limiter.
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses[3]).toBe(429)
  })
})

describe('POST /auth/code/verify', () => {
  const CODE = '123456'
  const liveRecord = () => ({ id: 'lc-1', codeHash: sha256(CODE) })

  it('issues tokens for a correct code and burns it (single-use)', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim a slot
      .mockResolvedValueOnce({ count: 1 }) // consume (single-use)
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', email: 'p@example.com', role: 'PARENT', schoolId: 'school-A',
      twoFactorEnabled: false, children: [], studentLinks: [], school: { id: 'school-A', name: 'VHPS' },
    })

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('access-token')
    expect(res.body.refreshToken).toBe('refresh-token')
    expect(res.body.user.id).toBe('u-1')
    // The consuming update set consumedAt.
    const consume = prismaMock.loginCode.updateMany.mock.calls.find(c => c[0].data?.consumedAt)
    expect(consume).toBeTruthy()
  })

  it('rejects a wrong code with 401 (slot claimed, not yet at ceiling)', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 0 }) // kill-at-ceiling: not at ceiling → no-op

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: '000000' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_code')
    // First updateMany is the atomic slot claim (increment attempts).
    expect(prismaMock.loginCode.updateMany.mock.calls[0][0].data).toEqual({ attempts: { increment: 1 } })
    expect(res.body.accessToken).toBeUndefined()
  })

  it('locks the code when a wrong attempt reaches the ceiling', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim (this one reaches MAX)
      .mockResolvedValueOnce({ count: 1 }) // kill-at-ceiling succeeds → lockout

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: '000000' })

    expect(res.status).toBe(401)
    // The kill update conditionally sets consumedAt.
    const kill = prismaMock.loginCode.updateMany.mock.calls[1][0]
    expect(kill.where.attempts).toEqual({ gte: 5 })
    expect(kill.data.consumedAt).toBeInstanceOf(Date)
  })

  it('returns 429 too_many_attempts when no slot can be claimed and code is unconsumed', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany.mockResolvedValueOnce({ count: 0 }) // claim fails (at ceiling)
    prismaMock.loginCode.findUnique.mockResolvedValue({ consumedAt: null })

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(429)
    expect(res.body.error).toBe('too_many_attempts')
    expect(res.body.accessToken).toBeUndefined()
  })

  it('returns 400 when the claim fails because the code was already consumed', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany.mockResolvedValueOnce({ count: 0 }) // claim fails
    prismaMock.loginCode.findUnique.mockResolvedValue({ consumedAt: new Date() })

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
  })

  it('returns 400 invalid_or_expired_code when no live code exists', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
    // No slot claim attempted when there's nothing to verify against.
    expect(prismaMock.loginCode.updateMany).not.toHaveBeenCalled()
  })

  it('loses the consume race → 400 (guarantees a single success)', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 0 }) // consume lost to a concurrent success

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
    expect(res.body.accessToken).toBeUndefined()
  })

  it('returns the 2FA handoff instead of tokens for a 2FA-enabled user', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.loginCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }) // consume
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-2fa', email: 'p@example.com', role: 'PARENT', schoolId: 'school-A',
      twoFactorEnabled: true, children: [], studentLinks: [], school: { id: 'school-A', name: 'VHPS' },
    })

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(200)
    expect(res.body.twoFactorRequired).toBe(true)
    expect(typeof res.body.twoFactorSessionToken).toBe('string')
    expect(res.body.accessToken).toBeUndefined()
    expect(res.body.refreshToken).toBeUndefined()
  })
})
