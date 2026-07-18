import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = {
  providerRefreshToken: { findUnique: vi.fn(), deleteMany: vi.fn() },
}
const prismaMock = {
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
  ),
  refreshToken: { create: vi.fn().mockResolvedValue({}) },
  user: { update: vi.fn().mockResolvedValue({}) },
  providerRefreshToken: { create: vi.fn().mockResolvedValue({}) },
  providerUser: { update: vi.fn().mockResolvedValue({}) },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const jwt = await import('../src/services/jwt')

// Guards the hard boundary between the two principal types: a provider-portal
// token must never authenticate a staff/parent request and vice versa.
describe('provider ↔ staff token isolation', () => {
  it('a provider token is rejected by the staff/parent verifier', () => {
    const token = jwt.generateProviderAccessToken({ id: 'pu-1', providerId: 'prov-1' })
    expect(() => jwt.verifyAccessToken(token)).toThrow()
    expect(jwt.verifyProviderAccessToken(token).providerId).toBe('prov-1')
  })

  it('a staff token is rejected by the provider verifier', () => {
    const token = jwt.generateAccessToken({ id: 'u-1', role: 'ADMIN', schoolId: 'school-1' })
    expect(() => jwt.verifyProviderAccessToken(token)).toThrow()
    expect(jwt.verifyAccessToken(token).userId).toBe('u-1')
  })
})

describe('rotateProviderRefreshToken (atomic, mirrors R3)', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000)
  const providerUser = { id: 'pu-1', providerId: 'prov-1' }
  beforeEach(() => vi.clearAllMocks())

  it('returns null (no new token) when a concurrent request already rotated it', async () => {
    tx.providerRefreshToken.findUnique.mockResolvedValue({ id: 'rt-1', expiresAt: future, providerUser })
    tx.providerRefreshToken.deleteMany.mockResolvedValue({ count: 0 })
    expect(await jwt.rotateProviderRefreshToken('shared')).toBeNull()
    expect(prismaMock.providerRefreshToken.create).not.toHaveBeenCalled()
  })

  it('issues a fresh pair for the winner', async () => {
    tx.providerRefreshToken.findUnique.mockResolvedValue({ id: 'rt-1', expiresAt: future, providerUser })
    tx.providerRefreshToken.deleteMany.mockResolvedValue({ count: 1 })
    const res = await jwt.rotateProviderRefreshToken('good')
    expect(res).not.toBeNull()
    expect(prismaMock.providerRefreshToken.create).toHaveBeenCalledTimes(1)
  })
})
