import { describe, it, expect, vi } from 'vitest'

/**
 * The 2FA limiters' rate-limit key.
 *
 * express-rate-limit 8 was logging ERR_ERL_KEY_GEN_IPV6 on every boot because
 * the fallback used `req.ip` raw. A raw IPv6 address is a useless bucket: an
 * ordinary residential allocation is a /64, so one attacker holds trillions of
 * addresses and can present a fresh one per request. Normalising to a /56 puts
 * the whole allocation in one bucket.
 *
 * Worth a test even though the bug was low-impact — the sessionToken branch is
 * the one every real request takes, so a broken fallback is invisible in use
 * and shows up only as a line in a startup log nobody reads.
 */

vi.mock('../src/services/prisma', () => ({ default: {} }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))

const { sessionOrIpKey } = await import('../src/routes/auth')

describe('sessionOrIpKey', () => {
  it('keys on the session token when there is one', () => {
    expect(sessionOrIpKey({ body: { sessionToken: 'st-123' }, ip: '203.0.113.4' })).toBe('st-123')
  })

  it('ignores an empty or non-string token rather than keying on it', () => {
    expect(sessionOrIpKey({ body: { sessionToken: '   ' }, ip: '203.0.113.4' })).not.toBe('   ')
    expect(sessionOrIpKey({ body: { sessionToken: 42 }, ip: '203.0.113.4' })).not.toBe('42')
  })

  it('falls back to the IP when there is no token', () => {
    expect(sessionOrIpKey({ body: {}, ip: '203.0.113.4' })).toBe('203.0.113.4')
  })

  // The actual bug: two addresses from one IPv6 allocation must share a bucket,
  // or the limit is bypassable by anyone with a /64 — which is everyone on IPv6.
  it('puts two addresses from the same IPv6 allocation in the SAME bucket', () => {
    const a = sessionOrIpKey({ body: {}, ip: '2001:db8:1234:5600::1' })
    const b = sessionOrIpKey({ body: {}, ip: '2001:db8:1234:5600::dead:beef' })
    expect(a).toBe(b)
    // And not the raw address, which is what made them different before.
    expect(a).not.toBe('2001:db8:1234:5600::1')
  })

  it('keeps genuinely different IPv6 allocations apart', () => {
    const a = sessionOrIpKey({ body: {}, ip: '2001:db8:1234:5600::1' })
    const b = sessionOrIpKey({ body: {}, ip: '2001:db8:9999:9900::1' })
    expect(a).not.toBe(b)
  })

  it('never returns an empty key, even with no token and no ip', () => {
    expect(sessionOrIpKey({ body: {} })).toBeTruthy()
  })
})
