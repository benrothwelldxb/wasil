import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Withdrawing a message (DELETE /conversations/:id/messages/:messageId).
//
// The soft delete itself was never the hard part — deletedAt/deletedBy have
// always been written. What was missing is that Conversation.lastMessageText is
// denormalised at send time, so the withdrawn words carried on showing as the
// thread preview in every inbox list (the parent app's and Desk's) beside a
// thread that now says the message was withdrawn. Prisma is mocked.

const prismaMock = {
  conversationMessage: { findFirst: vi.fn(), update: vi.fn() },
  conversation: { update: vi.fn() },
  notification: { updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))

const SENDER = { id: 'p-1', role: 'PARENT', schoolId: 'school-1', name: 'Sara Khan' }
let CURRENT_USER: typeof SENDER = { ...SENDER }
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = CURRENT_USER
    next()
  }
  return { isAuthenticated: setUser, isStaff: setUser, isAdmin: setUser, loadUserWithRelations: vi.fn() }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

const del = () => request(makeApp()).delete('/api/inbox/conversations/c-1/messages/m-2')

/** The message being withdrawn: sent by the current user, one minute ago. */
function ownRecentMessage() {
  return {
    id: 'm-2',
    conversationId: 'c-1',
    senderId: 'p-1',
    content: 'Sent by mistake',
    createdAt: new Date(Date.now() - 60 * 1000),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  CURRENT_USER = { ...SENDER }
  prismaMock.conversationMessage.update.mockResolvedValue({})
  prismaMock.conversation.update.mockResolvedValue({})
  prismaMock.notification.updateMany.mockResolvedValue({ count: 1 })
})

describe('DELETE /conversations/:id/messages/:messageId', () => {
  it('soft-deletes and falls the preview back to the last message still standing', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: 'Thanks, see you then', attachments: [] })

    const res = await del()
    expect(res.status).toBe(200)

    expect(prismaMock.conversationMessage.update).toHaveBeenCalledWith({
      where: { id: 'm-2' },
      data: { deletedAt: expect.any(Date), deletedBy: 'p-1' },
    })
    // The withdrawn words stop being the preview.
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: 'Thanks, see you then' },
    })
    // The fallback is the newest message that is NOT itself deleted.
    expect(prismaMock.conversationMessage.findFirst.mock.calls[1][0]).toMatchObject({
      where: { conversationId: 'c-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  })

  /**
   * A MESSAGE WITH ONLY A PHOTO ON IT STORES AN EMPTY `content`.
   *
   * The "Sent a photo" wording is composed at SEND time and never persisted,
   * so recomputing the preview from content alone blanked the inbox row
   * whenever the surviving message was attachment-only. An empty row reads as
   * a thread with nothing in it, rather than as a thread whose last word was a
   * picture — and it appears at exactly the moment someone has withdrawn
   * something, which is when a teacher is already unsure what the parent can
   * see.
   */
  it('describes an attachment-only fallback instead of blanking the row', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: '', attachments: [{ fileType: 'image/jpeg' }] })

    expect((await del()).status).toBe(200)
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: 'Sent a photo' },
    })
  })

  it('counts them, the way the send path does', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({
        content: '   ',
        attachments: [{ fileType: 'image/jpeg' }, { fileType: 'image/png' }],
      })

    expect((await del()).status).toBe(200)
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: 'Sent 2 photos' },
    })
  })

  it('prefers what the person actually wrote over the attachment wording', async () => {
    // A message with both is described by its words. "Sent a photo" would be
    // a worse preview than the sentence the parent typed next to it.
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({
        content: 'Here is the kit list',
        attachments: [{ fileType: 'application/pdf' }],
      })

    expect((await del()).status).toBe(200)
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: 'Here is the kit list' },
    })
  })

  it('still empties the row for a message with neither text nor attachment', async () => {
    // Should not exist, but an empty string is not a preview and must not be
    // stored as one — null is what the inbox renders as "no messages".
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: '', attachments: [] })

    expect((await del()).status).toBe(200)
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: null },
    })
  })

  it('empties the preview when the withdrawn message was the only one', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce(null)

    expect((await del()).status).toBe(200)
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageText: null },
    })
  })

  it('never rewinds lastMessageAt — a withdrawal must not drop the thread down the inbox', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: 'Earlier' })

    await del()
    expect(prismaMock.conversation.update.mock.calls[0][0].data).not.toHaveProperty('lastMessageAt')
  })

  it('only the sender may withdraw, and the preview is left alone when refused', async () => {
    CURRENT_USER = { ...SENDER, id: 'someone-else' }
    prismaMock.conversationMessage.findFirst.mockResolvedValueOnce(ownRecentMessage())

    expect((await del()).status).toBe(403)
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.conversation.update).not.toHaveBeenCalled()
  })

  it('refuses after the 15-minute window, leaving the preview alone', async () => {
    prismaMock.conversationMessage.findFirst.mockResolvedValueOnce({
      ...ownRecentMessage(),
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    })

    expect((await del()).status).toBe(403)
    expect(prismaMock.conversationMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.conversation.update).not.toHaveBeenCalled()
  })
})

/**
 * The notification carried the message too.
 *
 * Sending writes a Notification row whose body is the first 200 characters of
 * the message. Withdrawal didn't touch it, so the thread said "This message was
 * deleted" while the recipient's bell still held the text — and Connect's own
 * delete dialog promises the sender that recipients "will see 'This message was
 * deleted'", which wasn't true.
 */
describe('the notification is withdrawn too', () => {
  beforeEach(() => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: 'Thanks, see you then', attachments: [] })
  })

  it('rewrites the body of the notification for THIS message', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: {
        resourceType: 'CONVERSATION',
        resourceId: 'c-1',
        // Addressed by the message id stamped at send time. Matching on the
        // conversation alone would blank every notification in the thread
        // because one message was withdrawn.
        data: { path: ['messageId'], equals: 'm-2' },
      },
      data: { body: 'This message was deleted' },
    })
  })

  // Rewritten, not deleted: a ping followed by no trace is its own confusion,
  // and "something arrived and was taken back" is the same fact the thread
  // shows. It also matches the wording the sender was promised.
  it('says exactly what the thread says', async () => {
    await del()
    const written = prismaMock.notification.updateMany.mock.calls[0][0]
    expect(written.data).toEqual({ body: 'This message was deleted' })
    expect(written.where).not.toHaveProperty('deletedAt')
  })
})
