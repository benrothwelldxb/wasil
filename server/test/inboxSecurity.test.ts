import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const prismaMock = {
  conversation: { findFirst: vi.fn() },
  conversationMessage: { findFirst: vi.fn(), create: vi.fn() },
  conversationAttachment: { createMany: vi.fn() },
  messageReaction: { upsert: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'user-1', role: 'PARENT', schoolId: 'school-1' }
    next()
  }
  return { isAuthenticated: setUser, isStaff: setUser, isAdmin: setUser }
})

const { default: inboxRoutes } = await import('../src/routes/inbox')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inbox', inboxRoutes)
  return app
}

beforeEach(() => vi.clearAllMocks())

// Guards M4/M5: per-conversation actions require participation, and a reply
// target must belong to the conversation.
describe('inbox conversation access control', () => {
  it('rejects reacting on a conversation the user does not participate in (M5)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null) // not a participant
    const res = await request(makeApp()).post('/api/inbox/conversations/c-x/messages/m-1/react').send({ emoji: 'thumbsup' })
    expect(res.status).toBe(404)
    expect(prismaMock.messageReaction.upsert).not.toHaveBeenCalled()
  })

  it('rejects setting typing on a conversation the user does not participate in (M5)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/inbox/conversations/c-x/typing').send({})
    expect(res.status).toBe(404)
  })

  it('rejects a reply target that is not in the conversation (M4)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-1', parent: null, staff: null, schoolContact: null })
    prismaMock.conversationMessage.findFirst.mockResolvedValue(null) // replyToId not in this conversation
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/messages').send({ content: 'hi', replyToId: 'm-other' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationMessage.create).not.toHaveBeenCalled()
  })
})
