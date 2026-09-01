import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Who has actually got into the app.
 *
 * The admin list used to answer this with `welcomeSentAt`, which only records
 * that someone was emailed. Parents were let in by sign-in codes read out at
 * the gate, so "invited" and "got in" are close to unrelated — a parent can be
 * signed in having never been invited, and invited five times having never
 * signed in.
 */

const prismaMock = {
  user: { findMany: vi.fn() },
  refreshToken: { findMany: vi.fn() },
  loginCode: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { activatedParentIds, parentsBySignInStatus } = await import('../src/services/parentActivation')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.refreshToken.findMany.mockResolvedValue([])
  prismaMock.loginCode.findMany.mockResolvedValue([])
})

describe('activatedParentIds', () => {
  const parent = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    email: `${id}@example.com`,
    lastSeenAt: null,
    ...over,
  })

  it('counts a parent seen on an authenticated request', async () => {
    const result = await activatedParentIds([parent('p1', { lastSeenAt: new Date('2026-08-01') })])
    expect([...result]).toEqual(['p1'])
  })

  it('counts a parent holding a refresh token', async () => {
    prismaMock.refreshToken.findMany.mockResolvedValue([{ userId: 'p1' }])
    const result = await activatedParentIds([parent('p1')])
    expect([...result]).toEqual(['p1'])
  })

  // The one that matters: a code read out in person leaves no invite record and
  // no lastSeenAt on an old session, only a consumed LoginCode against the
  // address.
  it('counts a parent who consumed a sign-in code, though nobody invited them', async () => {
    prismaMock.loginCode.findMany.mockResolvedValue([{ email: 'p1@example.com' }])
    const result = await activatedParentIds([parent('p1')])
    expect([...result]).toEqual(['p1'])
  })

  it('does not count a parent with none of the three', async () => {
    const result = await activatedParentIds([parent('p1')])
    expect(result.size).toBe(0)
  })

  // An issued-but-unused code is exactly the parent we still need to chase.
  it('does not count a code that was issued but never consumed', async () => {
    prismaMock.loginCode.findMany.mockResolvedValue([])
    const result = await activatedParentIds([parent('p1')])
    expect(result.size).toBe(0)
    expect(prismaMock.loginCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ consumedAt: { not: null } }) }),
    )
  })

  it('asks for nothing when there are no parents', async () => {
    const result = await activatedParentIds([])
    expect(result.size).toBe(0)
    expect(prismaMock.refreshToken.findMany).not.toHaveBeenCalled()
    expect(prismaMock.loginCode.findMany).not.toHaveBeenCalled()
  })
})

describe('parentsBySignInStatus', () => {
  it('splits the roster and excludes Test Parents from both sides', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@example.com', lastSeenAt: new Date('2026-08-01') },
      { id: 'p2', email: 'p2@example.com', lastSeenAt: null },
      { id: 'p3', email: 'p3@example.com', lastSeenAt: null },
    ])
    prismaMock.loginCode.findMany.mockResolvedValue([{ email: 'p3@example.com' }])

    const { signedIn, neverSignedIn } = await parentsBySignInStatus('school-1')

    expect([...signedIn].sort()).toEqual(['p1', 'p3'])
    expect([...neverSignedIn]).toEqual(['p2'])
    // A Test Parent would otherwise appear on a chase list nobody should act on.
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isTest: false, role: 'PARENT' }) }),
    )
  })

  it('reports everyone as never signed in when nothing has happened yet', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@example.com', lastSeenAt: null },
      { id: 'p2', email: 'p2@example.com', lastSeenAt: null },
    ])

    const { signedIn, neverSignedIn } = await parentsBySignInStatus('school-1')

    expect(signedIn.size).toBe(0)
    expect(neverSignedIn.size).toBe(2)
  })
})
