import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// The partner API surface for Desk: a Bearer partner token (hash-verified) and a
// count-only unread inbox summary keyed on a Hub user id. Prisma is mocked.

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn(), updateMany: vi.fn() },
  conversationAttachment: { createMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  class: { findFirst: vi.fn() },
  school: { findFirst: vi.fn() },
  attendanceRequest: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const firebaseMock = {
  sendPushNotification: vi.fn(),
  removeInvalidTokens: vi.fn(),
}
vi.mock('../src/services/firebase', () => firebaseMock)

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.update.mockResolvedValue({})
  // Default: the token is valid.
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  firebaseMock.sendPushNotification.mockResolvedValue({ failedTokens: [] })
  firebaseMock.removeInvalidTokens.mockResolvedValue(undefined)
})

describe('partner auth', () => {
  it('401 without a Bearer token', async () => {
    const res = await request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=hu-1')
    expect(res.status).toBe(401)
  })

  it('401 on an unknown / revoked token', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValueOnce(null)
    const res = await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', 'Bearer nope')
    expect(res.status).toBe(401)

    prismaMock.partnerToken.findUnique.mockResolvedValueOnce({ id: 'pt-1', name: 'desk', revokedAt: new Date() })
    const res2 = await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', `Bearer ${TOKEN}`)
    expect(res2.status).toBe(401)
  })

  it('looks the token up by its SHA-256 hash, never the plaintext', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1' })
    prismaMock.conversation.count.mockResolvedValue(0)
    await request(makeApp())
      .get('/api/partner/inbox/summary?hub_user_id=hu-1')
      .set('Authorization', `Bearer ${TOKEN}`)
    expect(prismaMock.partnerToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: TOKEN_HASH } })
  })
})

describe('GET /api/partner/inbox/summary', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('400 when hub_user_id is missing', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary'))
    expect(res.status).toBe(400)
  })

  it('resolves the staff member by hubUserId and counts unread inbound threads', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'staff-9' })
    prismaMock.conversation.count.mockResolvedValue(3)

    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=hub-abc'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 3 })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { hubUserId: 'hub-abc' }, select: { id: true } })
    // Count is scoped to the staff member's own non-archived threads with an
    // unread, non-deleted inbound message — never content.
    expect(prismaMock.conversation.count).toHaveBeenCalledWith({
      where: {
        staffId: 'staff-9',
        archivedByStaff: false,
        messages: { some: { senderId: { not: 'staff-9' }, readAt: null, deletedAt: null } },
      },
    })
  })

  it('unknown user → { unread: 0 }, not an error (and no count query)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=ghost'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ unread: 0 })
    expect(prismaMock.conversation.count).not.toHaveBeenCalled()
  })
})

describe('GET /api/partner/attendance/today', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', timezone: 'Asia/Dubai' })
    prismaMock.attendanceRequest.findMany.mockResolvedValue([])
  })

  it('401 without a valid partner token', async () => {
    const res = await request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14')
    expect(res.status).toBe(401)
  })

  it('400 when school_id is missing', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today'))
    expect(res.status).toBe(400)
  })

  it('400 on a malformed date', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=14-08-2026'))
    expect(res.status).toBe(400)
  })

  it('unknown school → empty absences, not an error', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=ghost&date=2026-08-14'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ date: '2026-08-14', absences: [] })
    expect(prismaMock.attendanceRequest.findMany).not.toHaveBeenCalled()
  })

  it('resolves the school by Hub id and queries the date-covering window', async () => {
    await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14'))
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ hubSchoolId: 'hub-1' }, { id: 'hub-1' }] },
      select: { id: true, timezone: true },
    })
    const where = prismaMock.attendanceRequest.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('sch-1')
    expect(where.startDate).toEqual({ lte: '2026-08-14' })
    expect(where.OR).toEqual([
      { endDate: { gte: '2026-08-14' } },
      { AND: [{ endDate: null }, { startDate: { gte: '2026-08-14' } }] },
    ])
  })

  it('defaults date to today in the school timezone when omitted', async () => {
    // 2026-08-13 22:30 UTC is 2026-08-14 02:30 in Dubai (UTC+4).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-13T22:30:00.000Z'))
    try {
      const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1'))
      expect(res.body.date).toBe('2026-08-14')
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps rows to denormalised display data with hubClassId per row', async () => {
    prismaMock.attendanceRequest.findMany.mockResolvedValue([
      {
        type: 'ABSENCE', reason: 'illness', notes: 'high temp', startDate: '2026-08-14', endDate: null,
        time: null, status: 'PENDING',
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
      },
      {
        type: 'EARLY_PICKUP', reason: 'appointment', notes: null, startDate: '2026-08-12', endDate: '2026-08-15',
        time: '13:30', status: 'APPROVED',
        student: { firstName: 'Bilal', lastName: 'Khan', class: { name: '2B', hubClassId: null } },
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/attendance/today?school_id=hub-1&date=2026-08-14'))
    expect(res.status).toBe(200)
    expect(res.body.absences).toEqual([
      { studentName: 'Amina Khan', hubClassId: 'hc-1', className: '1A', type: 'ABSENCE', reason: 'illness', notes: 'high temp', startDate: '2026-08-14', endDate: null, time: null, status: 'PENDING' },
      { studentName: 'Bilal Khan', hubClassId: null, className: '2B', type: 'EARLY_PICKUP', reason: 'appointment', notes: null, startDate: '2026-08-12', endDate: '2026-08-15', time: '13:30', status: 'APPROVED' },
    ])
    // No other pupil PII leaked — exactly these keys.
    expect(Object.keys(res.body.absences[0]).sort()).toEqual(
      ['className', 'endDate', 'hubClassId', 'notes', 'reason', 'startDate', 'status', 'studentName', 'time', 'type'].sort(),
    )
  })
})

// The partner inbox routes (Desk hosts the 1:1 parent↔staff inbox; Connect stays
// the system of record). A staff/admin `actor` is resolved from a Hub user id; a
// parent id or unknown id → 403. Responses carry DISPLAY NAMES ONLY.
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }
const ADMIN = { id: 'admin-1', role: 'ADMIN', schoolId: 'sch-1', name: 'Head' }

describe('GET /api/partner/inbox/threads', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('403 when hub_user_id is unknown', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=ghost'))
    expect(res.status).toBe(403)
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })

  it('403 when the id resolves to a PARENT', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Dad' })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-p'))
    expect(res.status).toBe(403)
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })

  it('resolves the actor by hubUserId with the full staff shape', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff'))
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { hubUserId: 'hu-staff' },
      select: { id: true, role: true, schoolId: true, name: true },
    })
  })

  it('scopes a non-admin to their own non-archived threads and maps display fields', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-1',
        parent: { name: 'Amina Dad' },
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
        lastMessageText: 'Thanks!',
        lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        messages: [{ id: 'm-1' }, { id: 'm-2' }],
      },
      {
        id: 'c-2',
        parent: { name: 'No Student' },
        student: null,
        lastMessageText: null,
        lastMessageAt: new Date('2026-08-13T10:00:00.000Z'),
        messages: [],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff'))
    expect(res.status).toBe(200)
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ archivedByStaff: false, staffId: 'staff-1' })
    expect(prismaMock.conversation.findMany.mock.calls[0][0].orderBy).toEqual({ lastMessageAt: 'desc' })
    expect(res.body).toEqual({
      threads: [
        {
          id: 'c-1',
          parentName: 'Amina Dad',
          studentName: 'Amina Khan',
          hubClassId: 'hc-1',
          className: '1A',
          lastMessageText: 'Thanks!',
          lastMessageAt: '2026-08-14T10:00:00.000Z',
          unread: 2,
        },
        {
          id: 'c-2',
          parentName: 'No Student',
          studentName: null,
          hubClassId: null,
          className: null,
          lastMessageText: null,
          lastMessageAt: '2026-08-13T10:00:00.000Z',
          unread: 0,
        },
      ],
    })
  })

  it('locks the EXACT key set of a threads-list item (no PII can leak)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-1',
        parent: { name: 'Dad' },
        student: { firstName: 'A', lastName: 'K', class: { name: '1A', hubClassId: 'hc-1' } },
        lastMessageText: 'Hi',
        lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        messages: [],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff'))
    expect(Object.keys(res.body.threads[0]).sort()).toEqual(
      ['className', 'hubClassId', 'id', 'lastMessageAt', 'lastMessageText', 'parentName', 'studentName', 'unread'].sort(),
    )
  })

  it('admins are scoped to their school, not a single staffId', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-admin'))
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ archivedByStaff: false, schoolId: 'sch-1' })
  })

  it('class_id maps a Hub class id to a Connect class id and filters by student', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.class.findFirst.mockResolvedValue({ id: 'cls-connect' })
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff&class_id=hc-1'))
    expect(prismaMock.class.findFirst).toHaveBeenCalledWith({
      where: { hubClassId: 'hc-1', schoolId: 'sch-1' },
      select: { id: true },
    })
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where.student).toEqual({ classId: 'cls-connect' })
  })

  it('unknown class_id → empty threads, no conversation query', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.class.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff&class_id=nope'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ threads: [] })
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/partner/inbox/threads/:id', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('403 when the id resolves to a PARENT', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Dad' })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-p'))
    expect(res.status).toBe(403)
  })

  it('404 when the thread is another staff member’s and the actor is not admin', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-x?hub_user_id=hu-staff'))
    expect(res.status).toBe(404)
    // Gate: own thread OR (no admin branch for plain staff).
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-x',
      OR: [{ staffId: 'staff-1' }],
    })
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
  })

  it('an admin in the same school may read via the schoolId branch', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parent: { name: 'Dad' },
      student: { firstName: 'A', lastName: 'K', class: { name: '1A' } },
      messages: [],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-admin'))
    expect(res.status).toBe(200)
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-1',
      OR: [{ staffId: 'admin-1' }, { schoolId: 'sch-1' }],
    })
  })

  it('marks inbound messages read, excludes soft-deleted, and renames attachment fields', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parent: { name: 'Amina Dad' },
      student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      messages: [
        {
          id: 'm-1', senderId: 'p-1', content: 'Hello', createdAt: new Date('2026-08-14T09:00:00.000Z'),
          sender: { name: 'Amina Dad' },
          attachments: [{ fileName: 'note.pdf', fileUrl: 'https://x/note.pdf', fileType: 'application/pdf', fileSize: 1234 }],
        },
        {
          id: 'm-2', senderId: 'staff-1', content: 'Hi there', createdAt: new Date('2026-08-14T09:05:00.000Z'),
          sender: { name: 'Ms Noor' }, attachments: [],
        },
      ],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-staff'))
    expect(res.status).toBe(200)
    // mark-inbound-read side-effect
    expect(prismaMock.conversationMessage.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'c-1', senderId: { not: 'staff-1' }, readAt: null },
      data: { readAt: expect.any(Date) },
    })
    // soft-deleted excluded via the include filter
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].include.messages.where).toEqual({ deletedAt: null })
    expect(res.body.thread).toEqual({ id: 'c-1', parentName: 'Amina Dad', studentName: 'Amina Khan', className: '1A' })
    expect(res.body.messages).toEqual([
      {
        id: 'm-1', senderName: 'Amina Dad', mine: false, content: 'Hello', sentAt: '2026-08-14T09:00:00.000Z',
        attachments: [{ name: 'note.pdf', url: 'https://x/note.pdf', type: 'application/pdf', size: 1234 }],
      },
      { id: 'm-2', senderName: 'Ms Noor', mine: true, content: 'Hi there', sentAt: '2026-08-14T09:05:00.000Z', attachments: [] },
    ])
  })

  it('locks the EXACT key set of thread, a message, and an attachment', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parent: { name: 'Dad' },
      student: { firstName: 'A', lastName: 'K', class: { name: '1A' } },
      messages: [
        {
          id: 'm-1', senderId: 'p-1', content: 'Hi', createdAt: new Date('2026-08-14T09:00:00.000Z'),
          sender: { name: 'Dad' },
          attachments: [{ fileName: 'n.pdf', fileUrl: 'https://x/n.pdf', fileType: 'application/pdf', fileSize: 1 }],
        },
      ],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-staff'))
    expect(Object.keys(res.body.thread).sort()).toEqual(['className', 'id', 'parentName', 'studentName'].sort())
    expect(Object.keys(res.body.messages[0]).sort()).toEqual(
      ['attachments', 'content', 'id', 'mine', 'senderName', 'sentAt'].sort(),
    )
    expect(Object.keys(res.body.messages[0].attachments[0]).sort()).toEqual(['name', 'size', 'type', 'url'].sort())
  })
})

describe('POST /api/partner/inbox/threads/:id/messages', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('403 when the id resolves to a PARENT', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Dad' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-p', content: 'hi' })
    expect(res.status).toBe(403)
  })

  it('400 when content is empty', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-staff', content: '   ' })
    expect(res.status).toBe(400)
    expect(prismaMock.conversationMessage.create).not.toHaveBeenCalled()
  })

  it('404 when the thread is not the actor’s', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-x/messages'))
      .send({ hub_user_id: 'hu-staff', content: 'hi' })
    expect(res.status).toBe(404)
  })

  it('creates the message + parent notification + push and returns { id, sentAt }', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'staff-1', schoolId: 'sch-1', mutedByParent: false,
      parent: { id: 'p-1', name: 'Amina Dad' }, staff: { id: 'staff-1', name: 'Ms Noor' }, schoolContact: null,
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-9', senderId: 'staff-1', content: 'Hello parent', createdAt: new Date('2026-08-14T11:00:00.000Z'),
    })
    prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-1' }])

    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-staff', content: 'Hello parent' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: 'msg-9', sentAt: '2026-08-14T11:00:00.000Z' })
    expect(prismaMock.conversationMessage.create).toHaveBeenCalledWith({
      data: { conversationId: 'c-1', senderId: 'staff-1', content: 'Hello parent' },
    })
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { lastMessageAt: new Date('2026-08-14T11:00:00.000Z'), lastMessageText: 'Hello parent' },
    })
    // Notification fans out to the PARENT.
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'p-1',
        type: 'DIRECT_MESSAGE',
        title: 'Message from Ms Noor',
        body: 'Hello parent',
        resourceType: 'CONVERSATION',
        resourceId: 'c-1',
        data: { conversationId: 'c-1', route: '/inbox/c-1' },
        schoolId: 'sch-1',
      },
    })
    expect(firebaseMock.sendPushNotification).toHaveBeenCalledWith(['tok-1'], expect.objectContaining({ title: 'Message from Ms Noor' }))
  })

  it('respects mutedByParent — Notification still written, no push sent', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'staff-1', schoolId: 'sch-1', mutedByParent: true,
      parent: { id: 'p-1', name: 'Dad' }, staff: { id: 'staff-1', name: 'Ms Noor' }, schoolContact: null,
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-9', senderId: 'staff-1', content: 'Hi', createdAt: new Date('2026-08-14T11:00:00.000Z'),
    })
    await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-staff', content: 'Hi' })
    expect(prismaMock.notification.create).toHaveBeenCalledOnce()
    expect(firebaseMock.sendPushNotification).not.toHaveBeenCalled()
  })

  it('writes pre-hosted attachment rows for the created message', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'staff-1', schoolId: 'sch-1', mutedByParent: false,
      parent: { id: 'p-1', name: 'Dad' }, staff: { id: 'staff-1', name: 'Ms Noor' }, schoolContact: null,
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-9', senderId: 'staff-1', content: 'See file', createdAt: new Date('2026-08-14T11:00:00.000Z'),
    })
    prismaMock.deviceToken.findMany.mockResolvedValue([])
    await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-staff', content: 'See file', attachments: [{ fileName: 'a.pdf', fileUrl: 'https://x/a.pdf', fileType: 'application/pdf', fileSize: 9 }] })
    expect(prismaMock.conversationAttachment.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'msg-9', fileName: 'a.pdf', fileUrl: 'https://x/a.pdf', fileType: 'application/pdf', fileSize: 9 }],
    })
  })
})

describe('POST /api/partner/inbox/threads', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('403 when the id resolves to a PARENT', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Dad' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-p', parentId: 'p-2' })
    expect(res.status).toBe(403)
  })

  it('400 when neither parentId nor studentId resolves a parent', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-staff' })
    expect(res.status).toBe(400)
  })

  it('verifies a given parentId is a same-school PARENT and finds-or-creates', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.user.findFirst.mockResolvedValue({ id: 'p-1' })
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    prismaMock.conversation.create.mockResolvedValue({ id: 'c-new' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-staff', parentId: 'p-1' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'c-new' })
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', schoolId: 'sch-1', role: 'PARENT' },
      select: { id: true },
    })
    expect(prismaMock.conversation.create).toHaveBeenCalledWith({
      data: { schoolId: 'sch-1', parentId: 'p-1', staffId: 'staff-1', studentId: null, schoolContactId: null },
    })
  })

  it('resolves the parent via ParentStudentLink when only studentId is given', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({ userId: 'p-1' })
    prismaMock.user.findFirst.mockResolvedValue({ id: 'p-1' })
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    prismaMock.conversation.create.mockResolvedValue({ id: 'c-new' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-staff', studentId: 'stu-1' })
    expect(res.status).toBe(200)
    expect(prismaMock.parentStudentLink.findFirst).toHaveBeenCalledWith({ where: { studentId: 'stu-1' }, select: { userId: true } })
    expect(prismaMock.conversation.create.mock.calls[0][0].data.studentId).toBe('stu-1')
  })

  it('returns the existing thread and un-archives the staff side on re-open', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.user.findFirst.mockResolvedValue({ id: 'p-1' })
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-old', archivedByStaff: true })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-staff', parentId: 'p-1' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'c-old' })
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({ where: { id: 'c-old' }, data: { archivedByStaff: false } })
    expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/partner/inbox/recipients', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
  const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Khan' }

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ classId: 'cls-A' }])
    prismaMock.student.findMany.mockResolvedValue([])
  })

  it('403 when the hub_user_id is unresolvable or a parent (bad actor — same rule as the thread routes)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=ghost'))
    expect(res.status).toBe(403)

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'A Parent' })
    const res2 = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=parent'))
    expect(res2.status).toBe(403)
  })

  it('scope=own: resolves the actor\'s assigned classes and lists only those pupils', async () => {
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([{ classId: 'cls-A' }, { classId: 'cls-B' }])
    prismaMock.student.findMany.mockResolvedValue([
      { id: 'st-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' }, parentLinks: [{ user: { name: 'Sara Khan' } }] },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hub-1'))
    expect(res.status).toBe(200)
    expect(prismaMock.staffClassAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: 'staff-1', class: { schoolId: 'sch-1' } },
      select: { classId: true },
    })
    const where = prismaMock.student.findMany.mock.calls[0][0].where
    expect(where).toEqual({ schoolId: 'sch-1', classId: { in: ['cls-A', 'cls-B'] } })
    expect(res.body.recipients[0]).toEqual({
      studentId: 'st-1', studentName: 'Amina Khan', className: '1A', parentName: 'Sara Khan',
    })
    // Key-set lock — exactly these four fields, no pupil PII.
    expect(Object.keys(res.body.recipients[0]).sort()).toEqual(['className', 'parentName', 'studentId', 'studentName'])
  })

  it('scope=own with no assigned classes → 200 { recipients: [] } (never an error, no student query)', async () => {
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hub-1'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ recipients: [] })
    expect(prismaMock.student.findMany).not.toHaveBeenCalled()
  })

  it('scope=school: no class filter, hard-scoped to the actor\'s school (never cross-school)', async () => {
    await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hub-1&scope=school'))
    expect(prismaMock.staffClassAssignment.findMany).not.toHaveBeenCalled()
    const where = prismaMock.student.findMany.mock.calls[0][0].where
    expect(where).toEqual({ schoolId: 'sch-1' })
    // Ordered by class then name.
    expect(prismaMock.student.findMany.mock.calls[0][0].orderBy).toEqual([
      { class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' },
    ])
  })

  it('null class / no parent link degrade to null, not crash', async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { id: 'st-9', firstName: 'No', lastName: 'Parent', class: null, parentLinks: [] },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hub-1'))
    expect(res.body.recipients[0]).toEqual({ studentId: 'st-9', studentName: 'No Parent', className: null, parentName: null })
  })
})
