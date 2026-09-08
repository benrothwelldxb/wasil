import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Read receipts on 1-to-1 threads, and the direction they run in.
 *
 * Staff may see whether a parent has read theirs — "did they see the message
 * asking to meet, or should I ring?" is a real question with a real answer
 * Connect already holds.
 *
 * A parent may not see whether staff have read theirs. That is not a display
 * preference: a parent who can see their message was read an hour ago and not
 * answered is holding a grievance the school never agreed to, and staff read
 * messages between lessons without being free to reply.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  conversation: { findMany: vi.fn(), findFirst: vi.fn() },
  conversationMessage: { updateMany: vi.fn() },
  conversationParticipant: { update: vi.fn() },
  class: { findFirst: vi.fn() },
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
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }

const READ = new Date('2026-09-08T19:42:00.000Z')
const SENT = new Date('2026-09-08T17:00:00.000Z')

const threadRow = (messages: Array<Record<string, unknown>>) => ({
  id: 'c-1',
  staffId: 'staff-1',
  kind: 'STAFF',
  schoolId: 'sch-1',
  parent: { name: 'Sara Khan' },
  student: { firstName: 'Amina', lastName: 'Khan', class: { name: '3A', hubClassId: 'hc-3a' } },
  lastMessageText: 'Could we meet?',
  lastMessageAt: SENT,
  participants: [],
  messages,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(STAFF)
  prismaMock.conversationMessage.updateMany.mockResolvedValue({ count: 0 })
})

describe('the thread list answers "have they read mine?"', () => {
  it('reports the read time of the staff member’s own last message', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      threadRow([{ senderId: 'staff-1', readAt: READ, createdAt: SENT }]),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-1'))

    expect(res.status).toBe(200)
    expect(res.body.threads[0].yourLastMessage).toEqual({
      sentAt: SENT.toISOString(),
      readAt: READ.toISOString(),
    })
  })

  it('reports null when it has been sent and not read', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      threadRow([{ senderId: 'staff-1', readAt: null, createdAt: SENT }]),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-1'))
    expect(res.body.threads[0].yourLastMessage).toEqual({ sentAt: SENT.toISOString(), readAt: null })
  })

  // "Never written here" and "written and unread" are different facts, and the
  // second one is the one a teacher chases. Absent, not null.
  it('omits it entirely when the staff member has never written in the thread', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      threadRow([{ senderId: 'parent-1', readAt: null, createdAt: SENT }]),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-1'))
    expect(res.body.threads[0]).not.toHaveProperty('yourLastMessage')
  })

  it('uses the most recent of several of their own messages', async () => {
    const older = new Date('2026-09-01T09:00:00.000Z')
    prismaMock.conversation.findMany.mockResolvedValue([
      threadRow([
        { senderId: 'staff-1', readAt: READ, createdAt: older },
        { senderId: 'staff-1', readAt: null, createdAt: SENT },
      ]),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-1'))
    // The newer one is unread — which is the answer, even though an older one
    // was read.
    expect(res.body.threads[0].yourLastMessage).toEqual({ sentAt: SENT.toISOString(), readAt: null })
  })

  // Widening the message include to both directions must not change the unread
  // count, which is about INBOUND only.
  it('still counts only inbound messages as unread', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      threadRow([
        { senderId: 'staff-1', readAt: null, createdAt: SENT },
        { senderId: 'parent-1', readAt: null, createdAt: SENT },
      ]),
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-1'))
    expect(res.body.threads[0].unread).toBe(1)
  })
})

describe('the thread itself carries a stamp per message', () => {
  const detail = (messages: Array<Record<string, unknown>>) => ({
    ...threadRow(messages),
    participants: [],
    messages: messages.map(m => ({
      sender: { name: 'Ms Noor' }, attachments: [], reactions: [], deletedAt: null, ...m,
    })),
  })

  it('sends readAt on the staff member’s own message', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(
      detail([{ id: 'm-1', senderId: 'staff-1', content: 'Could we meet?', readAt: READ, createdAt: SENT }]),
    )
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-1'))
    expect(res.status).toBe(200)
    expect(res.body.messages[0]).toMatchObject({ mine: true, readAt: READ.toISOString() })
  })

  it('sends null when unread', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(
      detail([{ id: 'm-1', senderId: 'staff-1', content: 'Could we meet?', readAt: null, createdAt: SENT }]),
    )
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-1'))
    expect(res.body.messages[0].readAt).toBeNull()
  })

  // Whether a parent saw something before it was withdrawn is exactly what a
  // teacher needs to know afterwards.
  it('keeps the stamp on a withdrawn message, even though the content goes', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(
      detail([{
        id: 'm-1', senderId: 'staff-1', content: 'Could we meet?',
        readAt: READ, createdAt: SENT, deletedAt: new Date('2026-09-08T20:00:00.000Z'),
      }]),
    )
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-1'))
    expect(res.body.messages[0]).toMatchObject({ deleted: true, content: '', readAt: READ.toISOString() })
  })
})
