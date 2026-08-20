import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'crypto'

// Exercises the env-gated Test-Account sign-in bypass in /auth/code/verify and
// the /auth/code/request short-circuit for isTest users. Prisma + token + email
// layers are mocked (no DB), mirroring authLoginCode.test.ts.
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
const TEST_CODE = 'ABC-TEST-123'

// A user shaped exactly like the verify success path expects (serializeUser).
const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u-test', email: 'test.fs1blue@vhps.ae', role: 'PARENT', schoolId: 'school-A',
  isTest: true, twoFactorEnabled: false,
  children: [], studentLinks: [], school: { id: 'school-A', name: 'VHPS' },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.loginCode.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.loginCode.create.mockResolvedValue({ id: 'lc-1' })
  prismaMock.loginCode.update.mockResolvedValue({})
  prismaMock.user.update.mockResolvedValue({})
  delete process.env.TEST_LOGIN_CODE
})
afterEach(() => {
  delete process.env.TEST_LOGIN_CODE
})

describe('POST /auth/code/verify — Test-Account bypass', () => {
  it('accepts TEST_LOGIN_CODE for an isTest user and issues a real session', async () => {
    process.env.TEST_LOGIN_CODE = TEST_CODE
    prismaMock.user.findUnique.mockResolvedValue(userRow())

    const res = await request(makeApp())
      .post('/auth/code/verify')
      .send({ email: 'test.fs1blue@vhps.ae', code: TEST_CODE })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('access-token')
    expect(res.body.refreshToken).toBe('refresh-token')
    expect(res.body.user.id).toBe('u-test')
    // The bypass authenticates WITHOUT consuming an emailed LoginCode.
    expect(prismaMock.loginCode.findFirst).not.toHaveBeenCalled()
  })

  it('REJECTS the test code for a NON-test user (falls through to emailed-code flow)', async () => {
    process.env.TEST_LOGIN_CODE = TEST_CODE
    // isTest:false → bypass must not fire; normal flow finds no live code.
    prismaMock.user.findUnique.mockResolvedValue(userRow({ isTest: false }))
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp())
      .post('/auth/code/verify')
      .send({ email: 'real.parent@vhps.ae', code: TEST_CODE })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_or_expired_code')
    expect(res.body.accessToken).toBeUndefined()
  })

  it('REJECTS the bypass when TEST_LOGIN_CODE is unset, even for an isTest user', async () => {
    // No env set. Bypass block is skipped entirely; normal flow → no live code.
    prismaMock.user.findUnique.mockResolvedValue(userRow())
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp())
      .post('/auth/code/verify')
      .send({ email: 'test.fs1blue@vhps.ae', code: TEST_CODE })

    expect(res.status).toBe(400)
    expect(res.body.accessToken).toBeUndefined()
  })

  it('REJECTS a wrong code from an isTest user (not equal to TEST_LOGIN_CODE)', async () => {
    process.env.TEST_LOGIN_CODE = TEST_CODE
    prismaMock.user.findUnique.mockResolvedValue(userRow())
    prismaMock.loginCode.findFirst.mockResolvedValue(null)

    const res = await request(makeApp())
      .post('/auth/code/verify')
      .send({ email: 'test.fs1blue@vhps.ae', code: 'not-the-code' })

    expect(res.status).toBe(400)
    expect(res.body.accessToken).toBeUndefined()
  })

  it('leaves the normal emailed-code path unchanged (valid code → tokens)', async () => {
    // TEST_LOGIN_CODE set, but this is a real parent using a real emailed code.
    process.env.TEST_LOGIN_CODE = TEST_CODE
    const EMAILED = '654321'
    prismaMock.user.findUnique.mockResolvedValue(userRow({ isTest: false }))
    prismaMock.loginCode.findFirst.mockResolvedValue({
      id: 'lc-1', email: 'real.parent@vhps.ae', codeHash: sha256(EMAILED),
      attempts: 0, consumedAt: null, expiresAt: new Date(Date.now() + 5 * 60 * 1000), createdAt: new Date(),
    })

    const res = await request(makeApp())
      .post('/auth/code/verify')
      .send({ email: 'real.parent@vhps.ae', code: EMAILED })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('access-token')
    // The emailed code was consumed (single-use).
    const consumeCall = prismaMock.loginCode.update.mock.calls.find(c => c[0].data.consumedAt)
    expect(consumeCall).toBeTruthy()
  })
})

describe('POST /auth/code/request — isTest short-circuit', () => {
  it('returns { ok: true } for an isTest user WITHOUT minting or emailing a code', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-test', email: 'test.fs1blue@vhps.ae', schoolId: 'school-A', isTest: true, school: { name: 'VHPS' },
    })

    const res = await request(makeApp())
      .post('/auth/code/request')
      .send({ email: 'test.fs1blue@vhps.ae' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prismaMock.loginCode.create).not.toHaveBeenCalled()
    expect(sendLoginCodeEmail).not.toHaveBeenCalled()
  })

  it('still mints + emails for a normal (non-test) user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', email: 'real.parent@vhps.ae', schoolId: 'school-A', isTest: false, school: { name: 'VHPS' },
    })

    const res = await request(makeApp())
      .post('/auth/code/request')
      .send({ email: 'real.parent@vhps.ae' })

    expect(res.status).toBe(200)
    expect(prismaMock.loginCode.create).toHaveBeenCalledTimes(1)
    expect(sendLoginCodeEmail).toHaveBeenCalledTimes(1)
  })
})
