import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'

// Exercises the passwordless 6-digit sign-in (/auth/code/request + verify) with
// the data + token + email layers mocked — no database.
const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  loginCode: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
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
  prismaMock.loginCode.update.mockResolvedValue({})
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
      id: 'u-1', email: 'known@example.com', schoolId: 'school-A', school: { name: 'VHPS' },
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
    // ~10 min TTL.
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
      id: 'u-2', email: 'spam@example.com', schoolId: 'school-A', school: { name: 'VHPS' },
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
  const liveRecord = (over: Record<string, unknown> = {}) => ({
    id: 'lc-1',
    email: 'p@example.com',
    codeHash: sha256(CODE),
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    createdAt: new Date(),
    ...over,
  })

  it('issues tokens for a correct code and burns it (single-use)', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', email: 'p@example.com', role: 'PARENT', schoolId: 'school-A',
      twoFactorEnabled: false, children: [], studentLinks: [], school: { id: 'school-A', name: 'VHPS' },
    })

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('access-token')
    expect(res.body.refreshToken).toBe('refresh-token')
    expect(res.body.user.id).toBe('u-1')
    // consumedAt stamped on the winning code.
    const consumeCall = prismaMock.loginCode.update.mock.calls.find(c => c[0].data.consumedAt)
    expect(consumeCall).toBeTruthy()
  })

  it('rejects a wrong code with 401 and increments attempts', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord({ attempts: 1 }))

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: '000000' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_code')
    expect(prismaMock.loginCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lc-1' }, data: { attempts: 2 } })
    )
    // No tokens issued.
    expect(res.body.accessToken).toBeUndefined()
  })

  it('locks the code on the 5th wrong attempt (invalidates it)', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord({ attempts: 4 }))

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: '000000' })

    expect(res.status).toBe(401)
    const call = prismaMock.loginCode.update.mock.calls[0][0]
    expect(call.data.attempts).toBe(5)
    expect(call.data.consumedAt).toBeInstanceOf(Date)
  })

  it('returns 429 too_many_attempts when the code is already at the ceiling', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord({ attempts: 5 }))

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(429)
    expect(res.body.error).toBe('too_many_attempts')
    // Even a correct code cannot revive a locked row.
    expect(res.body.accessToken).toBeUndefined()
  })

  it('returns 400 invalid_or_expired_code when no live code exists', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
  })

  it('cannot reuse a consumed code (findFirst filters consumed → 400)', async () => {
    // A consumed code never matches the un-consumed filter, so the route sees none.
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp()).post('/auth/code/verify').send({ email: 'p@example.com', code: CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
  })

  it('returns the 2FA handoff instead of tokens for a 2FA-enabled user', async () => {
    prismaMock.loginCode.findFirst.mockResolvedValue(liveRecord())
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
