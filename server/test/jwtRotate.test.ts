import { describe, it, expect, vi, beforeEach } from 'vitest'

// Interactive-transaction body: rotateRefreshToken runs its find+claim inside
// prisma.$transaction(async (tx) => ...). generateRefreshToken (the winner path)
// uses the top-level client with an array-form $transaction.
const tx = {
  refreshToken: { findUnique: vi.fn(), deleteMany: vi.fn() },
}
const prismaMock = {
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (t: typeof tx) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ),
  refreshToken: { create: vi.fn().mockResolvedValue({}) },
  user: { update: vi.fn().mockResolvedValue({}) },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { rotateRefreshToken } = await import('../src/services/jwt')

const validUser = { id: 'u1', role: 'PARENT', schoolId: 'school-1' }
const future = new Date(Date.now() + 60 * 60 * 1000)
const past = new Date(Date.now() - 60 * 60 * 1000)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.refreshToken.create.mockResolvedValue({})
  prismaMock.user.update.mockResolvedValue({})
})

// Guards R3: rotation must be atomic and never throw on a concurrent/expired
// token — the auth path the client auto-retries.
describe('rotateRefreshToken (R3 atomic-rotation guardrail)', () => {
  it('returns null for an unknown token', async () => {
    tx.refreshToken.findUnique.mockResolvedValue(null)
    expect(await rotateRefreshToken('missing')).toBeNull()
  })

  it('returns null (no throw) when a concurrent request already rotated the token', async () => {
    tx.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: future, user: validUser })
    tx.refreshToken.deleteMany.mockResolvedValue({ count: 0 }) // lost the race
    await expect(rotateRefreshToken('shared')).resolves.toBeNull()
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled() // no new token issued
  })

  it('returns null for an expired token', async () => {
    tx.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: past, user: validUser })
    tx.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
    expect(await rotateRefreshToken('expired')).toBeNull()
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled()
  })

  it('issues a fresh pair for the winning rotation', async () => {
    tx.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: future, user: validUser })
    tx.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
    const res = await rotateRefreshToken('good')
    expect(res).not.toBeNull()
    expect(typeof res!.accessToken).toBe('string')
    expect(typeof res!.refreshToken).toBe('string')
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1)
  })
})
