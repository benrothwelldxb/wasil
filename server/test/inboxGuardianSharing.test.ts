import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Co-guardian opt-in thread sharing (Phase 1). A thread's PRIMARY parent may
// share ONE child-specific thread with another LINKED GUARDIAN of that same
// child; the added guardian can read/reply/mute/leave. Safeguarding-critical:
// only the primary parent may add, and non-primary parents may NOT add. Prisma
// is mocked (the established pattern in this repo — see inboxSecurity.test.ts).

const prismaMock = {
  conversation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  conversationMessage: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  conversationAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  conversationParticipant: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  parentStudentLink: { findFirst: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const firebaseMock = { sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }
vi.mock('../src/services/firebase', () => firebaseMock)

// The current authenticated user is swappable per-test.
let CURRENT_USER: { id: string; role: string; schoolId: string; name: string } = {
  id: 'primary-1', role: 'PARENT', schoolId: 'school-1', name: 'Primary Parent',
}
vi.mock('../src/middleware/auth', () => {
  const setUser = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = CURRENT_USER
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

const PRIMARY = { id: 'primary-1', role: 'PARENT', schoolId: 'school-1', name: 'Primary Parent' }
const GUARDIAN = { id: 'guardian-2', role: 'PARENT', schoolId: 'school-1', name: 'Co Guardian' }
const OUTSIDER = { id: 'outsider-9', role: 'PARENT', schoolId: 'school-1', name: 'Other Parent' }

beforeEach(() => {
  vi.clearAllMocks()
  CURRENT_USER = { ...PRIMARY }
  firebaseMock.sendPushNotification.mockResolvedValue({ failedTokens: [] })
  firebaseMock.removeInvalidTokens.mockResolvedValue(undefined)
  prismaMock.deviceToken.findMany.mockResolvedValue([])
})

// ── GET /conversations/:id/guardians ──────────────────────────────────────────
describe('GET /conversations/:id/guardians', () => {
  it('lists student, addable co-guardians, and current participants (primary parent)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' },
      participants: [],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { userId: 'primary-1', user: { name: 'Primary Parent' } }, // excluded (the primary)
      { userId: 'guardian-2', user: { name: 'Co Guardian' } },   // addable
    ])
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1/guardians')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      student: { id: 'stu-1', name: 'Amina Khan' },
      addable: [{ userId: 'guardian-2', name: 'Co Guardian' }],
      participants: [],
    })
    // The lookup is scoped to the requester's own thread.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-1', parentId: 'primary-1' })
  })

  it('a thread with no studentId returns null student and empty addable (sharing N/A)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-2', parentId: 'primary-1', studentId: null, schoolId: 'school-1',
      student: null, participants: [],
    })
    const res = await request(makeApp()).get('/api/inbox/conversations/c-2/guardians')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ student: null, addable: [], participants: [] })
    expect(prismaMock.parentStudentLink.findMany).not.toHaveBeenCalled()
  })

  it('404 when the requester is not the primary parent of the thread', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).get('/api/inbox/conversations/c-x/guardians')
    expect(res.status).toBe(404)
  })
})

// ── POST /conversations/:id/guardians ─────────────────────────────────────────
describe('POST /conversations/:id/guardians', () => {
  it('primary parent adds a linked guardian (success)', async () => {
    prismaMock.conversation.findFirst
      .mockResolvedValueOnce({
        id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
        student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' },
        participants: [],
      })
      .mockResolvedValueOnce({
        id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
        student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' },
        participants: [{ userId: 'guardian-2', user: { name: 'Co Guardian' } }],
      })
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({ id: 'link-1' })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    prismaMock.conversationParticipant.create.mockResolvedValue({ id: 'part-1' })

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/guardians').send({ userId: 'guardian-2' })
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.create).toHaveBeenCalledWith({
      data: { conversationId: 'c-1', userId: 'guardian-2', role: 'PARENT', addedById: 'primary-1' },
    })
    // The added guardian is verified to be a same-school PARENT linked to the student.
    expect(prismaMock.parentStudentLink.findFirst).toHaveBeenCalledWith({
      where: { userId: 'guardian-2', studentId: 'stu-1', user: { schoolId: 'school-1', role: 'PARENT' } },
      select: { id: true },
    })
    expect(res.body.participants).toEqual([{ userId: 'guardian-2', name: 'Co Guardian' }])
  })

  it('rejects a userId that is not a linked guardian of the student (400, no create)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' }, participants: [],
    })
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null) // not linked
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/guardians').send({ userId: 'outsider-9' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })

  it('SAFEGUARDING: a NON-primary parent cannot add a guardian (404, no create)', async () => {
    CURRENT_USER = { ...GUARDIAN } // not the primary parent
    // The owned-thread lookup (parentId = requester) finds nothing.
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/guardians').send({ userId: 'outsider-9' })
    expect(res.status).toBe(404)
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-1', parentId: 'guardian-2' })
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })

  it('a thread with no studentId cannot be shared (400)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-2', parentId: 'primary-1', studentId: null, schoolId: 'school-1',
      student: null, participants: [],
    })
    const res = await request(makeApp()).post('/api/inbox/conversations/c-2/guardians').send({ userId: 'guardian-2' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })

  it('adding an already-added guardian is an idempotent no-op success (no duplicate create)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' },
      participants: [{ userId: 'guardian-2', user: { name: 'Co Guardian' } }],
    })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/guardians').send({ userId: 'guardian-2' })
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
    expect(res.body.participants).toEqual([{ userId: 'guardian-2', name: 'Co Guardian' }])
  })

  it('cannot add the primary parent as a participant (400)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', studentId: 'stu-1', schoolId: 'school-1',
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan' }, participants: [],
    })
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/guardians').send({ userId: 'primary-1' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })
})

// ── DELETE /conversations/:id/guardians/:userId ───────────────────────────────
describe('DELETE /conversations/:id/guardians/:userId', () => {
  it('primary parent can remove a guardian', async () => {
    prismaMock.conversationParticipant.findFirst.mockResolvedValue({
      id: 'part-1', conversation: { parentId: 'primary-1' },
    })
    prismaMock.conversationParticipant.delete.mockResolvedValue({ id: 'part-1' })
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/guardians/guardian-2')
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.delete).toHaveBeenCalledWith({ where: { id: 'part-1' } })
  })

  it('a guardian can leave (DELETE self)', async () => {
    CURRENT_USER = { ...GUARDIAN }
    prismaMock.conversationParticipant.findFirst.mockResolvedValue({
      id: 'part-1', conversation: { parentId: 'primary-1' },
    })
    prismaMock.conversationParticipant.delete.mockResolvedValue({ id: 'part-1' })
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/guardians/guardian-2')
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.delete).toHaveBeenCalled()
  })

  it('an unrelated parent cannot remove someone else (404, no delete)', async () => {
    CURRENT_USER = { ...OUTSIDER }
    prismaMock.conversationParticipant.findFirst.mockResolvedValue({
      id: 'part-1', conversation: { parentId: 'primary-1' },
    })
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/guardians/guardian-2')
    expect(res.status).toBe(404)
    expect(prismaMock.conversationParticipant.delete).not.toHaveBeenCalled()
  })

  it('404 when the participant row does not exist', async () => {
    prismaMock.conversationParticipant.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/guardians/ghost')
    expect(res.status).toBe(404)
  })
})

// ── Added guardian visibility & access ────────────────────────────────────────
describe('added guardian access', () => {
  it('added guardian can GET the thread (authorized via the participants OR-clause) and it stamps participant.lastReadAt', async () => {
    CURRENT_USER = { ...GUARDIAN }
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', studentId: 'stu-1', schoolId: 'school-1',
      parent: { id: 'primary-1', name: 'Primary Parent', avatarUrl: null },
      staff: { id: 'staff-1', name: 'Ms Noor', avatarUrl: null },
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      schoolContact: null,
      participants: [{ id: 'part-1', userId: 'guardian-2', mutedAt: null, user: { name: 'Guardian Two' } }],
      lastMessageAt: new Date('2026-08-19T10:00:00.000Z'),
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
      mutedByParent: false, mutedByStaff: false,
      messages: [],
    })
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1')
    expect(res.status).toBe(200)
    // Detail response exposes sharing state: `shared` true for an added guardian,
    // and the participant roster (for the "shared with" header indicator).
    expect(res.body.shared).toBe(true)
    expect(res.body.participants).toContainEqual({ userId: 'guardian-2', name: 'Guardian Two' })
    // The where-clause authorizes the guardian via participants.some(userId).
    const orClause = prismaMock.conversation.findFirst.mock.calls[0][0].where.OR
    expect(orClause).toContainEqual({ participants: { some: { userId: 'guardian-2' } } })
    // Read-state is stamped on the participant row, NOT ConversationMessage.readAt.
    expect(prismaMock.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' }, data: { lastReadAt: expect.any(Date) },
    })
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
  })

  it('added guardian can POST a reply (participantWhere authorizes) and fan-out notifies primary parent + staff', async () => {
    CURRENT_USER = { ...GUARDIAN }
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1',
      parent: { id: 'primary-1', name: 'Primary Parent' },
      staff: { id: 'staff-1', name: 'Ms Noor' },
      schoolContact: null,
      participants: [{ userId: 'guardian-2', mutedAt: null }],
      mutedByParent: false, mutedByStaff: false,
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-1', senderId: 'guardian-2', content: 'Hello from co-guardian', createdAt: new Date('2026-08-19T11:00:00.000Z'),
    })
    prismaMock.conversationAttachment.findMany.mockResolvedValue([])

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/messages').send({ content: 'Hello from co-guardian' })
    expect(res.status).toBe(201)
    // participantWhere carries the participants OR-clause.
    const orClause = prismaMock.conversation.findFirst.mock.calls[0][0].where.OR
    expect(orClause).toContainEqual({ participants: { some: { userId: 'guardian-2' } } })
    // Notifications fan out to the primary parent and staff (not the sender).
    const notifiedUserIds = prismaMock.notification.create.mock.calls.map(c => c[0].data.userId).sort()
    expect(notifiedUserIds).toEqual(['primary-1', 'staff-1'])
    expect(notifiedUserIds).not.toContain('guardian-2')
  })

  it('GET /conversations includes shared threads with the guardian-view unread count', async () => {
    CURRENT_USER = { ...GUARDIAN }
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', studentId: 'stu-1', schoolContactId: null,
        staff: { id: 'staff-1', name: 'Ms Noor', avatarUrl: null },
        student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
        schoolContact: null,
        participants: [{ mutedAt: null, lastReadAt: null }], // never read ⇒ all inbound count
        messages: [
          { readAt: null, createdAt: new Date('2026-08-19T09:00:00.000Z') },
          { readAt: null, createdAt: new Date('2026-08-19T09:05:00.000Z') },
        ],
        lastMessageAt: new Date('2026-08-19T09:05:00.000Z'),
        lastMessageText: 'Hi', mutedByParent: false,
        createdAt: new Date('2026-08-18T09:00:00.000Z'),
      },
    ])
    const res = await request(makeApp()).get('/api/inbox/conversations')
    expect(res.status).toBe(200)
    // The list query ORs own threads with shared (participant, non-archived) ones.
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where.OR).toEqual([
      { parentId: 'guardian-2', archivedByParent: false },
      { participants: { some: { userId: 'guardian-2', archivedAt: null } } },
    ])
    expect(res.body[0]).toMatchObject({ id: 'c-1', unreadCount: 2, shared: true })
  })

  it('GET /unread-count includes shared threads (lastReadAt gates the count)', async () => {
    CURRENT_USER = { ...GUARDIAN }
    prismaMock.conversation.findMany.mockResolvedValue([]) // no own parent threads
    prismaMock.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 'c-1', lastReadAt: new Date('2026-08-19T09:00:00.000Z') },
    ])
    prismaMock.conversationMessage.count.mockResolvedValue(3)
    const res = await request(makeApp()).get('/api/inbox/unread-count')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ count: 3 })
    // Counted as inbound, non-deleted, newer than the participant's lastReadAt.
    expect(prismaMock.conversationMessage.count).toHaveBeenCalledWith({
      where: {
        conversationId: 'c-1',
        senderId: { not: 'guardian-2' },
        deletedAt: null,
        createdAt: { gt: new Date('2026-08-19T09:00:00.000Z') },
      },
    })
  })

  it('after removal the ex-guardian can no longer read the thread (404)', async () => {
    CURRENT_USER = { ...GUARDIAN }
    // With no participant row remaining, the authorized-reader lookup misses.
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1')
    expect(res.status).toBe(404)
  })
})
