import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'

const prismaMock = {
  providerUser: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  providerInvitation: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/jwt', () => ({
  generateProviderAccessToken: vi.fn(() => 'provider-access'),
  generateProviderRefreshToken: vi.fn(async () => 'provider-refresh'),
  revokeProviderRefreshToken: vi.fn(),
  rotateProviderRefreshToken: vi.fn(),
  // requireProvider (imported transitively via middleware) needs this to exist:
  verifyProviderAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))

const { default: providerAuthRoutes } = await import('../src/routes/providerAuth')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/provider/auth', providerAuthRoutes)
  return app
}

const ACTIVE_PROVIDER = { id: 'prov-1', name: 'Aqua Club', type: 'ECA', status: 'ACTIVE', logoUrl: null }

beforeEach(() => vi.clearAllMocks())

describe('POST /provider/auth/login', () => {
  it('rejects an unknown email generically', async () => {
    prismaMock.providerUser.findUnique.mockResolvedValue(null)
    const res = await request(makeApp()).post('/provider/auth/login').send({ email: 'nobody@x.com', password: 'x' })
    expect(res.status).toBe(401)
    expect(res.body.accessToken).toBeUndefined()
  })

  it('rejects a wrong password and counts the failed attempt', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4)
    prismaMock.providerUser.findUnique.mockResolvedValue({
      id: 'pu-1', providerId: 'prov-1', email: 'coach@x.com', name: 'Coach',
      passwordHash, failedLoginAttempts: 0, lockedUntil: null, provider: ACTIVE_PROVIDER,
    })
    const res = await request(makeApp()).post('/provider/auth/login').send({ email: 'coach@x.com', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(prismaMock.providerUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 1 }) }),
    )
  })

  it('refuses login to a suspended provider', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4)
    prismaMock.providerUser.findUnique.mockResolvedValue({
      id: 'pu-1', providerId: 'prov-1', email: 'coach@x.com', name: 'Coach',
      passwordHash, failedLoginAttempts: 0, lockedUntil: null,
      provider: { ...ACTIVE_PROVIDER, status: 'SUSPENDED' },
    })
    const res = await request(makeApp()).post('/provider/auth/login').send({ email: 'coach@x.com', password: 'correct-horse' })
    expect(res.status).toBe(403)
  })

  it('issues tokens on a correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 4)
    prismaMock.providerUser.findUnique.mockResolvedValue({
      id: 'pu-1', providerId: 'prov-1', email: 'coach@x.com', name: 'Coach',
      passwordHash, failedLoginAttempts: 0, lockedUntil: null, provider: ACTIVE_PROVIDER,
    })
    const res = await request(makeApp()).post('/provider/auth/login').send({ email: 'coach@x.com', password: 'correct-horse' })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('provider-access')
    expect(res.body.providerUser.providerId).toBe('prov-1')
  })
})

describe('POST /provider/auth/register (invitation)', () => {
  it('rejects an invalid/used invitation token', async () => {
    prismaMock.providerInvitation.findUnique.mockResolvedValue(null)
    const res = await request(makeApp()).post('/provider/auth/register').send({ token: 'nope', password: 'Whatever123' })
    expect(res.status).toBe(400)
  })

  it('refuses to reset an already-set-up account', async () => {
    prismaMock.providerInvitation.findUnique.mockResolvedValue({
      id: 'inv-1', providerId: 'prov-1', email: 'coach@x.com', status: 'PENDING', expiresAt: null, provider: ACTIVE_PROVIDER,
    })
    prismaMock.providerUser.findUnique.mockResolvedValue({ id: 'pu-1', passwordHash: 'existing' })
    const res = await request(makeApp()).post('/provider/auth/register').send({ token: 'tok', password: 'Whatever123', name: 'Coach' })
    expect(res.status).toBe(409)
  })

  it('creates a new provider user and returns tokens', async () => {
    prismaMock.providerInvitation.findUnique.mockResolvedValue({
      id: 'inv-1', providerId: 'prov-1', email: 'coach@x.com', status: 'PENDING', expiresAt: null, provider: ACTIVE_PROVIDER,
    })
    prismaMock.providerUser.findUnique.mockResolvedValue(null)
    prismaMock.providerUser.create.mockResolvedValue({
      id: 'pu-1', providerId: 'prov-1', email: 'coach@x.com', name: 'Coach', provider: ACTIVE_PROVIDER,
    })
    prismaMock.providerInvitation.update.mockResolvedValue({})
    const res = await request(makeApp()).post('/provider/auth/register').send({ token: 'tok', password: 'Whatever123', name: 'Coach' })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('provider-access')
    expect(prismaMock.providerInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REDEEMED' }) }),
    )
  })
})
