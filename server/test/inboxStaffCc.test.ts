import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Staff CC (Phase 2). A thread's PRIMARY parent may add an ADDITIONAL staff
// member (a "CC") as a STAFF-role participant. Security-critical: the parent may
// only CC staff within their bounded contactable set (a teacher of one of their
// children's classes, or a published school-contact assignee) — never arbitrary
// staff. The CC'd staff then sees + replies to the thread in both inboxes.
// Prisma is mocked (the established pattern — see inboxGuardianSharing.test.ts).

const prismaMock = {
  conversation: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  conversationMessage: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  conversationAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  conversationParticipant: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  parentStudentLink: { findFirst: vi.fn(), findMany: vi.fn() },
  child: { findMany: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  schoolContact: { findMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  school: { findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const firebaseMock = { sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }
vi.mock('../src/services/firebase', () => firebaseMock)

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
const OTHER_PARENT = { id: 'other-2', role: 'PARENT', schoolId: 'school-1', name: 'Other Parent' }
const CC_STAFF = { id: 'cc-staff-1', role: 'STAFF', schoolId: 'school-1', name: 'CC Teacher' }

beforeEach(() => {
  vi.clearAllMocks()
  CURRENT_USER = { ...PRIMARY }
  firebaseMock.sendPushNotification.mockResolvedValue({ failedTokens: [] })
  firebaseMock.removeInvalidTokens.mockResolvedValue(undefined)
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
  prismaMock.child.findMany.mockResolvedValue([])
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([])
  prismaMock.schoolContact.findMany.mockResolvedValue([])
})

// ── GET /conversations/:id/staff ──────────────────────────────────────────────
describe('GET /conversations/:id/staff', () => {
  it('lists STAFF participants + addable staff (primary parent only)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1',
      participants: [{ userId: 'teacher-1', role: 'STAFF', user: { name: 'Ms Teacher' } }],
    })
    // Contactable set: the primary teacher (staff-1), the CC'd teacher-1, plus a
    // school-contact assignee liaison-1.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([{ student: { classId: 'cls-1' } }])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      { userId: 'staff-1', user: { name: 'Primary Teacher' } },
      { userId: 'teacher-1', user: { name: 'Ms Teacher' } },
    ])
    prismaMock.schoolContact.findMany.mockResolvedValue([
      { assignedUserId: 'liaison-1', assignedUser: { name: 'Parent Liaison' } },
    ])

    const res = await request(makeApp()).get('/api/inbox/conversations/c-1/staff')
    expect(res.status).toBe(200)
    // participants = the current STAFF CCs.
    expect(res.body.participants).toEqual([{ userId: 'teacher-1', name: 'Ms Teacher' }])
    // addable = contactable MINUS the primary staffId MINUS existing participants.
    expect(res.body.addable).toEqual([{ userId: 'liaison-1', name: 'Parent Liaison' }])
    // Scoped to the requester's own thread.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-1', parentId: 'primary-1' })
  })

  it('403 for a non-parent', async () => {
    CURRENT_USER = { ...CC_STAFF }
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1/staff')
    expect(res.status).toBe(403)
  })

  it('404 when the requester is not the primary parent', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).get('/api/inbox/conversations/c-x/staff')
    expect(res.status).toBe(404)
  })
})

// ── POST /conversations/:id/staff ─────────────────────────────────────────────
describe('POST /conversations/:id/staff', () => {
  it('primary parent CCs a child’s class teacher (success)', async () => {
    prismaMock.conversation.findFirst
      .mockResolvedValueOnce({ id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1', participants: [] })
      .mockResolvedValueOnce({
        id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1',
        participants: [{ userId: 'teacher-1', role: 'STAFF', user: { name: 'Ms Teacher' } }],
      })
    prismaMock.user.findFirst.mockResolvedValue({ id: 'teacher-1' })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([{ student: { classId: 'cls-1' } }])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ userId: 'teacher-1', user: { name: 'Ms Teacher' } }])
    prismaMock.conversationParticipant.create.mockResolvedValue({ id: 'part-1' })

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'teacher-1' })
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.create).toHaveBeenCalledWith({
      data: { conversationId: 'c-1', userId: 'teacher-1', role: 'STAFF', addedById: 'primary-1' },
    })
    // Target validated as a same-school staff user.
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'teacher-1', schoolId: 'school-1', role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    })
    expect(res.body.participants).toEqual([{ userId: 'teacher-1', name: 'Ms Teacher' }])
  })

  it('primary parent CCs a school-contact assignee (success)', async () => {
    prismaMock.conversation.findFirst
      .mockResolvedValueOnce({ id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1', participants: [] })
      .mockResolvedValueOnce({
        id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1',
        participants: [{ userId: 'liaison-1', role: 'STAFF', user: { name: 'Parent Liaison' } }],
      })
    prismaMock.user.findFirst.mockResolvedValue({ id: 'liaison-1' })
    // No class link — contactable only via the school contact.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    prismaMock.schoolContact.findMany.mockResolvedValue([
      { assignedUserId: 'liaison-1', assignedUser: { name: 'Parent Liaison' } },
    ])
    prismaMock.conversationParticipant.create.mockResolvedValue({ id: 'part-2' })

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'liaison-1' })
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.create).toHaveBeenCalledWith({
      data: { conversationId: 'c-1', userId: 'liaison-1', role: 'STAFF', addedById: 'primary-1' },
    })
    // No class assignments were consulted (no child classIds).
    expect(prismaMock.staffClassAssignment.findMany).not.toHaveBeenCalled()
  })

  it('SECURITY: cannot CC a staff member outside the contactable set (400, no create)', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1', participants: [],
    })
    // The target IS a real staff user, but is not a teacher of the parent's kids
    // nor a published school contact → not contactable.
    prismaMock.user.findFirst.mockResolvedValue({ id: 'rando-1' })
    prismaMock.parentStudentLink.findMany.mockResolvedValue([{ student: { classId: 'cls-1' } }])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ userId: 'teacher-1', user: { name: 'Ms Teacher' } }])
    prismaMock.schoolContact.findMany.mockResolvedValue([])

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'rando-1' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })

  it('cannot CC the primary staffId (already on the thread) — 400, no create, no gate lookup', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1', participants: [],
    })
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'staff-1' })
    expect(res.status).toBe(400)
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })

  it('re-adding an existing participant is an idempotent no-op success', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'primary-1', staffId: 'staff-1', schoolId: 'school-1',
      participants: [{ userId: 'teacher-1', role: 'STAFF', user: { name: 'Ms Teacher' } }],
    })
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ userId: 'teacher-1', user: { name: 'Ms Teacher' } }])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([{ student: { classId: 'cls-1' } }])

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'teacher-1' })
    expect(res.status).toBe(200)
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
    expect(res.body.participants).toEqual([{ userId: 'teacher-1', name: 'Ms Teacher' }])
  })

  it('a NON-primary parent cannot CC staff (404, no create)', async () => {
    CURRENT_USER = { ...OTHER_PARENT }
    prismaMock.conversation.findFirst.mockResolvedValue(null) // owned-thread lookup misses
    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/staff').send({ userId: 'teacher-1' })
    expect(res.status).toBe(404)
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-1', parentId: 'other-2' })
    expect(prismaMock.conversationParticipant.create).not.toHaveBeenCalled()
  })
})

// ── DELETE /conversations/:id/staff/:userId ───────────────────────────────────
describe('DELETE /conversations/:id/staff/:userId', () => {
  it('primary parent removes a STAFF CC', async () => {
    prismaMock.conversationParticipant.findFirst.mockResolvedValue({
      id: 'part-1', conversation: { parentId: 'primary-1' },
    })
    prismaMock.conversationParticipant.delete.mockResolvedValue({ id: 'part-1' })
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/staff/teacher-1')
    expect(res.status).toBe(200)
    // The lookup is constrained to a STAFF-role participant row.
    expect(prismaMock.conversationParticipant.findFirst).toHaveBeenCalledWith({
      where: { conversationId: 'c-1', userId: 'teacher-1', role: 'STAFF' },
      select: { id: true, conversation: { select: { parentId: true } } },
    })
    expect(prismaMock.conversationParticipant.delete).toHaveBeenCalledWith({ where: { id: 'part-1' } })
  })

  it('404 (not 403) when the requester is not the primary parent', async () => {
    CURRENT_USER = { ...OTHER_PARENT }
    prismaMock.conversationParticipant.findFirst.mockResolvedValue({
      id: 'part-1', conversation: { parentId: 'primary-1' },
    })
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/staff/teacher-1')
    expect(res.status).toBe(404)
    expect(prismaMock.conversationParticipant.delete).not.toHaveBeenCalled()
  })

  it('404 when no matching STAFF participant row exists', async () => {
    prismaMock.conversationParticipant.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).delete('/api/inbox/conversations/c-1/staff/ghost')
    expect(res.status).toBe(404)
  })
})

// ── Native staff inbox visibility for a CC'd staff member ─────────────────────
describe('CC’d staff visibility (native)', () => {
  it('GET /staff/conversations ORs own threads with CC’d threads, and unread uses the participant lastReadAt', async () => {
    CURRENT_USER = { ...CC_STAFF }
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-1', parentId: 'p-1', staffId: 'primary-staff', studentId: 'stu-1', schoolContactId: null,
        parent: { id: 'p-1', name: 'A Parent', avatarUrl: null },
        staff: { id: 'primary-staff', name: 'Primary Teacher' },
        student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
        schoolContact: null,
        // Actor is a CC (not the primary staff): unread from their lastReadAt.
        participants: [{ lastReadAt: new Date('2026-08-19T09:00:00.000Z'), mutedAt: null }],
        messages: [
          { readAt: null, createdAt: new Date('2026-08-19T09:30:00.000Z') },
          { readAt: null, createdAt: new Date('2026-08-19T08:00:00.000Z') }, // before lastReadAt ⇒ not counted
        ],
        lastMessageAt: new Date('2026-08-19T09:30:00.000Z'),
        lastMessageText: 'Hi', mutedByStaff: false,
        createdAt: new Date('2026-08-18T09:00:00.000Z'),
      },
    ])
    const res = await request(makeApp()).get('/api/inbox/staff/conversations')
    expect(res.status).toBe(200)
    // The list query ORs own (non-archived) threads with CC'd (STAFF participant) ones.
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where.OR).toEqual([
      { staffId: 'cc-staff-1', archivedByStaff: false },
      { participants: { some: { userId: 'cc-staff-1', role: 'STAFF', archivedAt: null } } },
    ])
    expect(res.body[0]).toMatchObject({ id: 'c-1', unreadCount: 1, ccd: true })
  })

  it('a CC’d staff member opening the thread stamps their participant lastReadAt (not message.readAt)', async () => {
    CURRENT_USER = { ...CC_STAFF }
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'primary-staff', studentId: 'stu-1', schoolId: 'school-1',
      parent: { id: 'p-1', name: 'A Parent', avatarUrl: null },
      staff: { id: 'primary-staff', name: 'Primary Teacher', avatarUrl: null },
      student: { id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      schoolContact: null,
      participants: [{ id: 'part-1', userId: 'cc-staff-1', mutedAt: null, user: { name: 'CC Teacher' } }],
      lastMessageAt: new Date('2026-08-19T10:00:00.000Z'),
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
      mutedByParent: false, mutedByStaff: false,
      messages: [],
    })
    const res = await request(makeApp()).get('/api/inbox/conversations/c-1')
    expect(res.status).toBe(200)
    // Authorized via the participants OR-clause.
    const orClause = prismaMock.conversation.findFirst.mock.calls[0][0].where.OR
    expect(orClause).toContainEqual({ participants: { some: { userId: 'cc-staff-1' } } })
    // Read-state stamped on the participant row, NOT ConversationMessage.readAt.
    expect(prismaMock.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' }, data: { lastReadAt: expect.any(Date) },
    })
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
  })

  it('a CC’d staff member can POST a reply; fan-out notifies the parent + primary staff (not the sender)', async () => {
    CURRENT_USER = { ...CC_STAFF }
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'primary-staff', schoolId: 'school-1',
      parent: { id: 'p-1', name: 'A Parent' },
      staff: { id: 'primary-staff', name: 'Primary Teacher' },
      schoolContact: null,
      participants: [{ userId: 'cc-staff-1', mutedAt: null }],
      mutedByParent: false, mutedByStaff: false,
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-1', senderId: 'cc-staff-1', content: 'Chiming in', createdAt: new Date('2026-08-19T11:00:00.000Z'),
    })
    prismaMock.conversationAttachment.findMany.mockResolvedValue([])

    const res = await request(makeApp()).post('/api/inbox/conversations/c-1/messages').send({ content: 'Chiming in' })
    expect(res.status).toBe(201)
    const notifiedUserIds = prismaMock.notification.create.mock.calls.map(c => c[0].data.userId).sort()
    expect(notifiedUserIds).toEqual(['p-1', 'primary-staff'])
    expect(notifiedUserIds).not.toContain('cc-staff-1')
  })
})
