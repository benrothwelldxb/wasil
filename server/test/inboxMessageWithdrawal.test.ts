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
})

describe('DELETE /conversations/:id/messages/:messageId', () => {
  it('soft-deletes and falls the preview back to the last message still standing', async () => {
    prismaMock.conversationMessage.findFirst
      .mockResolvedValueOnce(ownRecentMessage())
      .mockResolvedValueOnce({ content: 'Thanks, see you then' })

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
