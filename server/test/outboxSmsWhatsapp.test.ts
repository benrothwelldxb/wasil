import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the singleton prisma and every provider the outbox dispatches to.
const tx = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn().mockResolvedValue(undefined),
}
const prismaMock = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  outboxEntry: { create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
  alertDelivery: { update: vi.fn().mockResolvedValue({}) },
}
const sendSMS = vi.fn()
const sendWhatsApp = vi.fn()
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/twilio', () => ({ sendSMS, sendWhatsApp, isTwilioConfigured: () => true }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))
vi.mock('../src/services/firebase', () => ({
  sendPushNotification: vi.fn().mockResolvedValue({ failedTokens: [] }),
  removeInvalidTokens: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/services/logger', () => ({ default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../src/services/errorReporter', () => ({ captureException: vi.fn() }))

const { enqueueSms, enqueueWhatsapp, drainOutbox } = await import('../src/services/outbox')

beforeEach(() => {
  vi.clearAllMocks()
  tx.$executeRaw.mockResolvedValue(undefined)
  prismaMock.outboxEntry.create.mockResolvedValue({})
  prismaMock.outboxEntry.update.mockResolvedValue({})
  prismaMock.alertDelivery.update.mockResolvedValue({})
})

// Guards O2: SMS/WhatsApp are now first-class outbox kinds (they had none before)
// and emergency-alert text channels get retry instead of a single inline send.
describe('outbox SMS/WhatsApp (O2 reliable-delivery guardrail)', () => {
  it('enqueueSms creates an SMS outbox row carrying the delivery id', async () => {
    await enqueueSms('school-1', { to: '+971500000000', body: 'evacuate', alertDeliveryId: 'ad-1' })
    expect(prismaMock.outboxEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ schoolId: 'school-1', kind: 'SMS' }) }),
    )
  })

  it('enqueueWhatsapp creates a WHATSAPP outbox row', async () => {
    await enqueueWhatsapp('school-1', { to: '+971500000000', body: 'evacuate' })
    expect(prismaMock.outboxEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'WHATSAPP' }) }),
    )
  })

  it('drains an SMS entry: sends via Twilio and marks both rows SENT', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'ob-1', kind: 'SMS', payload: { to: '+971500000000', body: 'evacuate', alertDeliveryId: 'ad-1' }, attempts: 0 },
    ])
    sendSMS.mockResolvedValue({ sid: 'SM123' })

    const res = await drainOutbox()

    expect(sendSMS).toHaveBeenCalledWith('+971500000000', 'evacuate')
    expect(prismaMock.alertDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ad-1' }, data: expect.objectContaining({ status: 'SENT', externalId: 'SM123' }) }),
    )
    expect(prismaMock.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    )
    expect(res.processed).toBe(1)
  })

  it('retries (does not give up) when Twilio fails early', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'ob-1', kind: 'SMS', payload: { to: '+971500000000', body: 'evacuate', alertDeliveryId: 'ad-1' }, attempts: 0 },
    ])
    sendSMS.mockResolvedValue(null) // provider failure

    const res = await drainOutbox()

    expect(res.failed).toBe(1)
    // Not marked FAILED yet — scheduled for a backoff retry, delivery left pending.
    expect(prismaMock.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ status: 'FAILED' }) }),
    )
    expect(prismaMock.alertDelivery.update).not.toHaveBeenCalled()
  })

  it('marks the alert delivery FAILED once the outbox exhausts its retries', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'ob-1', kind: 'SMS', payload: { to: '+971500000000', body: 'evacuate', alertDeliveryId: 'ad-1' }, attempts: 4 }, // next = 5 = MAX
    ])
    sendSMS.mockResolvedValue(null)

    const res = await drainOutbox()

    expect(res.failed).toBe(1)
    expect(prismaMock.outboxEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
    expect(prismaMock.alertDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ad-1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })
})
