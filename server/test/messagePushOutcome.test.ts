import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Whether a staff message reached the parent's phone.
 *
 * A notification carries the start of the message, so a parent reads most
 * short messages in full on the lock screen and never opens the app. readAt
 * stays null, and to a teacher that looked exactly like the message never
 * arriving. Connect cannot know the first; it does know whether it sent
 * anything at all — and "nothing told them" is the case worth a phone call.
 */

const prismaMock = {
  conversation: { findFirst: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  conversationAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
}
const sendPush = vi.fn()
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: sendPush, removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/unreadCount', () => ({ getPushBadgeCount: vi.fn(async () => 1) }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'staff-1', schoolId: 'sch-1', role: 'STAFF', name: 'Ms Khan' }
    next()
  }
  return { isAuthenticated: attach, isStaff: attach, isAdmin: attach, loadUserWithRelations: vi.fn() }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')
const { pushOutcomeFor } = await import('../src/services/pushOutcome')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}
const send = () => request(makeApp()).post('/api/inbox/conversations/c-1/messages').send({ content: 'Could we meet?' })

const thread = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', schoolId: 'sch-1', parentId: 'p-1', staffId: 'staff-1',
  mutedByParent: false, mutedByStaff: false,
  parent: { id: 'p-1', name: 'Sadia' },
  staff: { id: 'staff-1', name: 'Ms Khan' },
  schoolContact: null,
  participants: [],
  ...over,
})
const tokensFor = (map: Record<string, string[]>) =>
  prismaMock.deviceToken.findMany.mockImplementation(async ({ where }: { where: { userId: string } }) =>
    (map[where.userId] ?? []).map(token => ({ token })))
const stored = () => prismaMock.conversationMessage.update.mock.calls.map(c => c[0].data.pushOutcome)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.conversation.findFirst.mockResolvedValue(thread())
  prismaMock.conversationMessage.create.mockResolvedValue({ id: 'm-1', createdAt: new Date('2026-11-27T09:00:00Z') })
  prismaMock.conversationMessage.update.mockResolvedValue({})
  prismaMock.conversation.update.mockResolvedValue({})
  prismaMock.notification.create.mockResolvedValue({})
  prismaMock.conversationAttachment.findMany.mockResolvedValue([])
  sendPush.mockResolvedValue({ successCount: 1, failureCount: 0, failedTokens: [] })
})

describe('recording it when staff send', () => {
  it('records NO_DEVICE when the parent has no phone set up — nothing alerted them', async () => {
    tokensFor({})
    const res = await send()
    expect(res.status).toBe(201)
    expect(stored()).toEqual(['NO_DEVICE'])
    expect(res.body.pushOutcome).toBe('NO_DEVICE')
  })

  it('records SENT when Apple/Google accepted it for their phone', async () => {
    tokensFor({ 'p-1': ['tok-a'] })
    const res = await send()
    expect(stored()).toEqual(['SENT'])
    expect(res.body.pushOutcome).toBe('SENT')
  })

  // Muting is the parent's own business, not something to report to staff.
  it('claims nothing for a muted thread', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(thread({ mutedByParent: true }))
    tokensFor({})
    const res = await send()
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
    expect(res.body.pushOutcome).toBeNull()
  })

  // Every device refusing looks the same as a brief FCM outage. Say nothing.
  it('claims nothing when every device refused', async () => {
    tokensFor({ 'p-1': ['tok-a'] })
    sendPush.mockResolvedValue({ successCount: 0, failureCount: 1, failedTokens: ['tok-a'] })
    await send()
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
  })

  // readAt is about the primary parent; so is this. A co-guardian's phone
  // must not make the primary parent look notified.
  it('is about the primary parent only, not a co-guardian on the thread', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(
      thread({ participants: [{ userId: 'p-2', mutedAt: null }] }),
    )
    tokensFor({ 'p-2': ['tok-co'] })
    await send()
    expect(stored()).toEqual(['NO_DEVICE'])
  })
})

describe('pushOutcomeFor', () => {
  it('is null for muted, whatever else is true', () => {
    expect(pushOutcomeFor({ muted: true, tokenCount: 0 })).toBeNull()
    expect(pushOutcomeFor({ muted: true, tokenCount: 2, successCount: 2 })).toBeNull()
  })
  it('separates no device from an attempted send', () => {
    expect(pushOutcomeFor({ muted: false, tokenCount: 0 })).toBe('NO_DEVICE')
    expect(pushOutcomeFor({ muted: false, tokenCount: 2, successCount: 1 })).toBe('SENT')
    expect(pushOutcomeFor({ muted: false, tokenCount: 2, successCount: 0 })).toBeNull()
  })
})
