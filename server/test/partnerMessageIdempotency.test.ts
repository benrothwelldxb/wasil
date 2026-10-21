import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * idempotency_key on POST /api/partner/messages.
 *
 * "Back at school" is sent from a phone on a coach, and the response is the
 * part most likely to be lost. A retry must return what the first attempt did
 * and tell nobody twice (R-35: the same event never sends twice).
 */

const sends = new Map<string, any>()
const prismaMock = {
  school: { findUnique: vi.fn() },
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  group: { findMany: vi.fn() },
  message: { create: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  partnerMessageSend: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
const notifyMock = { sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn(async () => ['parent-1', 'parent-2']) }
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({
  resolveHubStaffMembership: vi.fn(async () => ({ id: 'staff-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const BODY = {
  hub_user_id: 'hub-lead',
  title: 'Back at school',
  content: 'The coach is back at school.',
  audience: { groupIds: ['g-1'] },
  idempotency_key: 'beyond:trip:t-1:returned',
}
const send = (body: Record<string, unknown> = {}) =>
  request(makeApp()).post('/api/partner/messages').set('Authorization', 'Bearer tok').send({ ...BODY, ...body })

beforeEach(() => {
  vi.clearAllMocks()
  // The school has turned Wasil Beyond on (services/partnerSwitch).
  prismaMock.school.findUnique.mockResolvedValue({ beyondEnabled: true })
  sends.clear()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'beyond', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: true }])
  let n = 0
  prismaMock.message.create.mockImplementation(async () => ({ id: `m-${++n}` }))
  // A tiny honest store, keyed the way the unique index is, so a repeat
  // really does meet the first attempt's row.
  const keyOf = (partner: string, k: string) => `${partner}|${k}`
  prismaMock.partnerMessageSend.findUnique.mockImplementation(async ({ where }: any) =>
    sends.get(keyOf(where.partner_idempotencyKey.partner, where.partner_idempotencyKey.idempotencyKey)) ?? null)
  prismaMock.partnerMessageSend.create.mockImplementation(async ({ data }: any) => {
    const k = keyOf(data.partner, data.idempotencyKey)
    if (sends.has(k)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    const row = { id: `s-${sends.size + 1}`, ...data }
    sends.set(k, row)
    return row
  })
  prismaMock.partnerMessageSend.update.mockImplementation(async ({ where, data }: any) => {
    const row = [...sends.values()].find(r => r.id === where.id)
    Object.assign(row, data)
    return row
  })
  prismaMock.partnerMessageSend.delete.mockImplementation(async ({ where }: any) => {
    for (const [k, r] of sends) if (r.id === where.id) sends.delete(k)
    return {}
  })
})

describe('a repeated broadcast', () => {
  it('returns the first result and sends nothing the second time', async () => {
    const first = await send()
    expect(first.status).toBe(201)
    expect(first.body).toEqual({ created: 1, parents: 2, messageIds: ['m-1'] })

    const second = await send()
    expect(second.status).toBe(201)
    expect(second.body).toEqual({ created: 1, parents: 2, messageIds: ['m-1'], replayed: true })
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('replays even after the group was archived, because it already went', async () => {
    await send()
    prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Trip', isActive: false }])
    const second = await send()
    expect(second.status).toBe(201)
    expect(second.body.replayed).toBe(true)
  })

  it('is the same send when retried as a different member of staff', async () => {
    await send()
    const second = await send({ hub_user_id: 'hub-coordinator' })
    expect(second.body.replayed).toBe(true)
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })

  it('does not care what order the JSON keys arrive in', async () => {
    await send()
    const second = await send({ audience: { groupIds: ['g-1'] }, content: BODY.content, title: BODY.title })
    expect(second.body.replayed).toBe(true)
  })

  it('refuses the key reused for a different message', async () => {
    await send()
    const second = await send({ content: 'Running 20 minutes late.' })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe('idempotency_key_reused')
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })

  it('keeps keys per partner, so two apps cannot collide', async () => {
    await send()
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-2', name: 'desk', revokedAt: null })
    const other = await send()
    expect(other.body.replayed).toBeUndefined()
    expect(prismaMock.message.create).toHaveBeenCalledTimes(2)
  })

  it('answers in progress while the first attempt is still sending', async () => {
    await send()
    // Put the first attempt's row back to mid-send.
    Object.assign([...sends.values()][0], { status: 'PENDING', response: null })
    const res = await send()
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('idempotency_in_progress')
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })

  it('loses a race at the claim, not after writing a post', async () => {
    // The lookup misses, but another attempt claims the key first.
    prismaMock.partnerMessageSend.findUnique.mockResolvedValue(null)
    prismaMock.partnerMessageSend.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const res = await send()
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('idempotency_in_progress')
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })
})

describe('when the first attempt fails', () => {
  it('releases the key if nothing was written, so the retry sends', async () => {
    prismaMock.message.create.mockRejectedValueOnce(new Error('db down'))
    const first = await send()
    expect(first.status).toBe(500)
    expect(sends.size).toBe(0)

    const retry = await send()
    expect(retry.status).toBe(201)
    expect(retry.body.replayed).toBeUndefined()
  })

  it('holds the key as FAILED if posts were written, and never re-sends', async () => {
    notifyMock.resolveAudienceParentIds.mockRejectedValueOnce(new Error('boom'))
    const first = await send()
    expect(first.status).toBe(500)
    expect([...sends.values()][0].status).toBe('FAILED')

    const retry = await send()
    expect(retry.status).toBe(409)
    expect(retry.body).toMatchObject({ error: 'idempotency_key_failed', messageIds: ['m-1'] })
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
  })

  it('claims nothing for a request that fails validation', async () => {
    const bad = await send({ title: '' })
    expect(bad.status).toBe(400)
    expect(sends.size).toBe(0)
  })
})

describe('without a key', () => {
  it('behaves exactly as before', async () => {
    const res = await send({ idempotency_key: undefined })
    expect(res.status).toBe(201)
    expect(prismaMock.partnerMessageSend.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.partnerMessageSend.create).not.toHaveBeenCalled()
  })

  it('refuses a key that is blank or too long', async () => {
    expect((await send({ idempotency_key: '  ' })).status).toBe(400)
    expect((await send({ idempotency_key: 'x'.repeat(201) })).status).toBe(400)
  })
})
