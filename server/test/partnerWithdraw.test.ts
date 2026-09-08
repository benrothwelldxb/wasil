import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * DELETE /api/partner/inbox/threads/:id/messages/:messageId
 *
 * A teacher who sent from Desk had to open Connect to take it back, which
 * wasted most of a fifteen-minute window.
 *
 * The rules stay Connect's, and so does the implementation: this calls the same
 * withdrawal path rather than repeating the soft delete. A withdrawal is three
 * writes — the message, the thread preview, and the notification body that
 * carried the first 200 characters of it — and an endpoint doing two of them
 * would leave the recipient's bell holding text the sender was told had gone.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn() },
  conversationMessage: { findFirst: vi.fn(), update: vi.fn() },
  notification: { updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (t: string) => t }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const TOKEN = 'cpk_secret'
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }

const del = (body: Record<string, unknown> = { hub_user_id: 'hu-1' }) =>
  request(makeApp())
    .delete('/api/partner/inbox/threads/c-1/messages/m-1')
    .set('Authorization', `Bearer ${TOKEN}`)
    .send(body)

const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(STAFF)
  prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-1' })
  prismaMock.conversation.update.mockResolvedValue({})
  prismaMock.conversationMessage.findFirst
    .mockResolvedValueOnce({ id: 'm-1', conversationId: 'c-1', senderId: 'staff-1', createdAt: minutesAgo(2) })
    .mockResolvedValueOnce({ content: 'An earlier line' })
  prismaMock.conversationMessage.update.mockResolvedValue({})
  prismaMock.notification.updateMany.mockResolvedValue({ count: 1 })
})

describe('withdrawing from Desk', () => {
  it('soft-deletes, and returns the tombstone Desk already renders', async () => {
    const res = await del()

    expect(res.status).toBe(200)
    expect(res.body.message).toMatchObject({ id: 'm-1', deleted: true, content: '', attachments: [] })
    expect(res.body.message.deletedAt).toEqual(expect.any(String))
    expect(prismaMock.conversationMessage.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { deletedAt: expect.any(Date), deletedBy: 'staff-1' },
    })
  })

  // The reason this shares a path rather than mirroring one.
  it('rewrites the notification and the thread preview, not just the message', async () => {
    await del()
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: {
        resourceType: 'CONVERSATION',
        resourceId: 'c-1',
        data: { path: ['messageId'], equals: 'm-1' },
      },
      data: { body: 'This message was deleted' },
    })
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: 'An earlier line' },
    })
  })

  // Ordering the inbox, so a thread must not drop down the list because its
  // last line was withdrawn.
  it('does not rewind lastMessageAt', async () => {
    await del()
    expect(prismaMock.conversation.update.mock.calls[0][0].data).not.toHaveProperty('lastMessageAt')
  })
})

describe('the two refusals say different things', () => {
  it('403 not_sender on someone else’s message', async () => {
    prismaMock.conversationMessage.findFirst.mockReset()
    prismaMock.conversationMessage.findFirst.mockResolvedValue({
      id: 'm-1', conversationId: 'c-1', senderId: 'p-1', createdAt: minutesAgo(2),
    })
    const res = await del()
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('not_sender')
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
  })

  // Distinct from "not yours": a teacher who missed the window can be told so,
  // and a single 403 would leave Desk guessing which sentence to show.
  it('409 window_expired outside fifteen minutes, and names the window', async () => {
    prismaMock.conversationMessage.findFirst.mockReset()
    prismaMock.conversationMessage.findFirst.mockResolvedValue({
      id: 'm-1', conversationId: 'c-1', senderId: 'staff-1', createdAt: minutesAgo(20),
    })
    const res = await del()
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: 'window_expired', windowMinutes: 15 })
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
  })

  it('404 on a message that isn’t in the thread', async () => {
    prismaMock.conversationMessage.findFirst.mockReset()
    prismaMock.conversationMessage.findFirst.mockResolvedValue(null)
    const res = await del()
    expect(res.status).toBe(404)
  })
})

describe('who may ask', () => {
  it('403 without a resolvable actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await del({ hub_user_id: 'ghost' })
    expect(res.status).toBe(403)
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp())
      .delete('/api/partner/inbox/threads/c-1/messages/m-1')
      .send({ hub_user_id: 'hu-1' })
    expect(res.status).toBe(401)
  })

  // A thread the actor can't see must 404 before anything is said about a
  // message inside it — otherwise "not yours" and "doesn't exist" leak the
  // difference to someone who should see neither.
  it('404s on a thread the actor cannot see, without touching the message', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await del()
    expect(res.status).toBe(404)
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
  })
})
