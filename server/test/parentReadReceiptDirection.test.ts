import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/inbox/conversations/:id — read receipts run one way.
 *
 * Staff may see whether a parent read theirs. A parent may not see whether
 * staff read theirs, and the stamp is withheld in the PAYLOAD rather than
 * merely unrendered: the parent app doesn't display it today, but a payload
 * carrying it is one screen change away from a promise the school never made.
 *
 * A parent who can see their message was read an hour ago and not answered
 * holds a grievance nobody agreed to, and staff read messages between lessons
 * without being free to reply.
 */
const prismaMock = {
  conversation: { findFirst: vi.fn() },
  conversationMessage: { updateMany: vi.fn() },
  conversationParticipant: { update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))

const PARENT = { id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Sara Khan' }
const STAFF = { id: 's-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }
let CURRENT_USER: Record<string, unknown> = { ...PARENT }
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

const READ = new Date('2026-09-08T19:42:00.000Z')
const SENT = new Date('2026-09-08T17:00:00.000Z')

const msg = (senderId: string, readAt: Date | null) => ({
  id: `m-${senderId}`,
  senderId,
  sender: { id: senderId, name: senderId === 'p-1' ? 'Sara Khan' : 'Ms Noor' },
  content: 'Could we meet?',
  readAt,
  createdAt: SENT,
  deletedAt: null,
  replyTo: null,
  attachments: [],
  reactions: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  CURRENT_USER = { ...PARENT }
  prismaMock.conversationMessage.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.conversation.findFirst.mockResolvedValue({
    id: 'c-1',
    kind: 'STAFF',
    parentId: 'p-1',
    staffId: 's-1',
    schoolId: 'sch-1',
    studentId: null,
    mutedByParent: false,
    mutedByStaff: false,
    lastMessageAt: SENT,
    createdAt: SENT,
    staff: { id: 's-1', name: 'Ms Noor', avatarUrl: null },
    parent: { id: 'p-1', name: 'Sara Khan', avatarUrl: null },
    student: null,
    schoolContact: null,
    participants: [],
    // The parent's own message, which staff HAVE read, and a staff message the
    // parent has read.
    messages: [msg('p-1', READ), msg('s-1', READ)],
  })
})

const get = () => request(makeApp()).get('/api/inbox/conversations/c-1')

describe('a parent viewing their own thread', () => {
  it('is not told that staff read their message', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const mine = res.body.messages.find((m: { senderId: string }) => m.senderId === 'p-1')
    expect(mine.readAt).toBeNull()
  })

  // The strong form: no message the parent SENT carries a time anywhere, so no
  // future screen can render one and no client can infer it. Deliberately not a
  // blanket "this timestamp appears nowhere" — messages they RECEIVED legitimately
  // carry their own read state, which the test below pins.
  it('carries no read time on anything the parent sent', async () => {
    const res = await get()
    const sentByParent = res.body.messages.filter((m: { senderId: string }) => m.senderId === 'p-1')
    expect(sentByParent.length).toBeGreaterThan(0)
    for (const m of sentByParent) {
      expect(m.readAt).toBeNull()
      expect(JSON.stringify(m)).not.toContain(READ.toISOString())
    }
  })

  // Their own read state on a message they RECEIVED is theirs, says nothing
  // about anyone else, and the app uses it.
  it('still sees its own read state on messages it received', async () => {
    const res = await get()
    const theirs = res.body.messages.find((m: { senderId: string }) => m.senderId === 's-1')
    expect(theirs.readAt).toBe(READ.toISOString())
  })
})

describe('staff viewing the same thread', () => {
  beforeEach(() => { CURRENT_USER = { ...STAFF } })

  // The question this was built for: did the parent read the one asking to meet?
  it('is told when the parent read the staff message', async () => {
    const res = await get()
    const ours = res.body.messages.find((m: { senderId: string }) => m.senderId === 's-1')
    expect(ours.readAt).toBe(READ.toISOString())
  })

  it('sees the parent’s message read state unchanged', async () => {
    const res = await get()
    const theirs = res.body.messages.find((m: { senderId: string }) => m.senderId === 'p-1')
    expect(theirs.readAt).toBe(READ.toISOString())
  })
})
