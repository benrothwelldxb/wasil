import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Which device tokens a failed push may delete.
 *
 * Every caller hands `failedTokens` to removeInvalidTokens. It used to hold
 * every token that failed for ANY reason — and on a thrown send, every token
 * in the batch — so a brief FCM outage unregistered every phone it touched.
 * Those families stopped getting notifications, with nothing to tell them
 * or the school, until they next opened the app.
 */

const sendEachForMulticast = vi.fn()
vi.mock('firebase-admin', () => ({
  default: {
    credential: { cert: vi.fn(() => ({})) },
    initializeApp: vi.fn(() => ({})),
    messaging: () => ({ sendEachForMulticast }),
  },
}))

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p', private_key: 'k' })
const { sendPushNotification } = await import('../src/services/firebase')

const MSG = { title: 'Message from Ms Khan', body: 'Could we meet?' }
const ok = { success: true }
const fail = (code: string) => ({ success: false, error: { code, message: code } })

beforeEach(() => vi.clearAllMocks())

describe('sendPushNotification', () => {
  it('lists only tokens FCM says are dead for good', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 1, failureCount: 3,
      responses: [
        ok,
        fail('messaging/registration-token-not-registered'),
        fail('messaging/internal-error'),
        fail('messaging/invalid-registration-token'),
      ],
    })
    const r = await sendPushNotification(['a', 'b', 'c', 'd'], MSG)
    expect(r.failedTokens).toEqual(['b', 'd'])
    expect(r.unavailable).toBe(false)
  })

  it('keeps every token when FCM is having a bad moment', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 0, failureCount: 2,
      responses: [fail('messaging/server-unavailable'), fail('messaging/internal-error')],
    })
    const r = await sendPushNotification(['a', 'b'], MSG)
    expect(r.failedTokens).toEqual([])
    expect(r.unavailable).toBe(true)
  })

  // FCM also uses invalid-argument for a malformed PAYLOAD. Reading it as a
  // dead token would unregister every phone the bad message went to.
  it('does not treat invalid-argument as a dead token', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 0, failureCount: 1, responses: [fail('messaging/invalid-argument')],
    })
    const r = await sendPushNotification(['a'], MSG)
    expect(r.failedTokens).toEqual([])
  })

  it('keeps every token when the send throws', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('ECONNRESET'))
    const r = await sendPushNotification(['a', 'b', 'c'], MSG)
    expect(r).toMatchObject({ successCount: 0, failedTokens: [], unavailable: true })
  })

  it('is not "unavailable" when the only failures were dead tokens', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 0, failureCount: 1, responses: [fail('messaging/registration-token-not-registered')],
    })
    const r = await sendPushNotification(['a'], MSG)
    expect(r).toMatchObject({ failedTokens: ['a'], unavailable: false })
  })
})
