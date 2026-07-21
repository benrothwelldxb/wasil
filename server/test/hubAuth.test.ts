import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Mock the data + token layers so the Hub SSO exchange route can be exercised
// end-to-end without a database or a live Hub. We mock `verifyHubToken` (so no
// real JWKS/crypto is needed) but keep the *real* replay guard + provisioning
// logic so the guardrails they enforce are what's under test.
const prismaMock = {
  school: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/jwt', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(async () => 'refresh-token'),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))
vi.mock('../src/services/email', () => ({ sendMagicLinkEmail: vi.fn(), sendInvitationEmail: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

// Partial-mock hubSso: replace verifyHubToken (no live Hub) but keep the real
// single-use replay guard (consumeHubToken) + error types so replay is exercised.
vi.mock('../src/services/hubSso', async (importActual) => {
  const actual = await importActual<typeof import('../src/services/hubSso')>()
  return { ...actual, verifyHubToken: vi.fn() }
})

const { verifyHubToken, __resetReplayStore } = await import('../src/services/hubSso')
const { default: hubAuthRoutes } = await import('../src/routes/hubAuth')

const mockedVerify = vi.mocked(verifyHubToken)

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth/hub', hubAuthRoutes)
  return app
}

const ADMIN = 'http://localhost:3001'

// A verified-claims fixture. jti/schoolId overridable per test.
function claims(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: 'hub-user-1',
    jti: 'jti-' + Math.random().toString(36).slice(2),
    email: 'sara.bell@school.ae',
    name: 'Sara Bell',
    schoolId: 'hub-school-1',
    organisationId: 'hub-org-1',
    globalRoles: ['SCHOOL_ADMIN'],
    appRoles: [],
    appSlug: 'connect',
    expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 min out
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetReplayStore()
})

describe('GET /auth/hub/exchange — Hub SSO exchange guardrails', () => {
  it('redirects to login?error=school_not_linked when the school is not Hub-linked', async () => {
    mockedVerify.mockResolvedValue(claims() as never)
    prismaMock.school.findUnique.mockResolvedValue(null) // sid resolves to no Connect school

    const res = await request(makeApp()).get('/auth/hub/exchange?hub_token=tok')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}/login?error=school_not_linked`)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('redirects to login?error=no_account when no pre-existing staff account matches', async () => {
    mockedVerify.mockResolvedValue(claims() as never)
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: 'hub-school-1' })
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null) // no hubUserId link yet
      .mockResolvedValueOnce(null) // no email-matched staff user → never auto-create

    const res = await request(makeApp()).get('/auth/hub/exchange?hub_token=tok')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}/login?error=no_account`)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('links an existing staff user by email, sets hubUserId, and issues an auth code', async () => {
    mockedVerify.mockResolvedValue(claims() as never)
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: 'hub-school-1' })
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null) // not yet linked by hubUserId
      .mockResolvedValueOnce({     // pre-existing staff account, matched by email
        id: 'connect-user-1', role: 'STAFF', schoolId: 'connect-school-1',
        email: 'sara.bell@school.ae', hubUserId: null,
      })
    prismaMock.user.update.mockResolvedValue({
      id: 'connect-user-1', role: 'STAFF', schoolId: 'connect-school-1',
      email: 'sara.bell@school.ae', hubUserId: 'hub-user-1',
    })

    const res = await request(makeApp()).get('/auth/hub/exchange?hub_token=tok')

    // Linked the pre-existing account to the Hub identity...
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'connect-user-1' },
      data: { hubUserId: 'hub-user-1' },
    })
    // ...and handed off via the existing auth-code callback the admin app consumes.
    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(new RegExp(`^${ADMIN}/auth/callback\\?code=[a-f0-9]+$`))
  })

  it('rejects a second use of the same token (replay guard)', async () => {
    // Same claims (same jti) returned on both exchanges — a captured token replay.
    const fixed = claims({ jti: 'jti-replay-fixed' })
    mockedVerify.mockResolvedValue(fixed as never)
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: 'hub-school-1' })
    // Already-linked staff user → resolves without needing an update.
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'connect-user-1', role: 'ADMIN', schoolId: 'connect-school-1',
      email: 'sara.bell@school.ae', hubUserId: 'hub-user-1',
    })

    const app = makeApp()

    const first = await request(app).get('/auth/hub/exchange?hub_token=tok')
    expect(first.status).toBe(302)
    expect(first.headers.location).toMatch(new RegExp(`^${ADMIN}/auth/callback\\?code=`))

    const second = await request(app).get('/auth/hub/exchange?hub_token=tok')
    expect(second.status).toBe(302)
    expect(second.headers.location).toBe(`${ADMIN}/login?error=replayed`)
  })

  it('redirects to login?error=invalid_token when the token fails verification', async () => {
    const { HubTokenError } = await import('../src/services/hubSso')
    mockedVerify.mockRejectedValue(new HubTokenError())

    const res = await request(makeApp()).get('/auth/hub/exchange?hub_token=bad')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}/login?error=invalid_token`)
  })

  it('redirects to login?error=invalid_token when hub_token is missing', async () => {
    const res = await request(makeApp()).get('/auth/hub/exchange')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ADMIN}/login?error=invalid_token`)
    expect(mockedVerify).not.toHaveBeenCalled()
  })
})
