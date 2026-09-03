import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// The partner API surface for Desk: a Bearer partner token (hash-verified) and a
// count-only unread inbox summary keyed on a Hub user id. Prisma is mocked.

const prismaMock = {
  messageReaction: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  conversationParticipant: { update: vi.fn() },
  conversationAttachment: { createMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  class: { findFirst: vi.fn(), findMany: vi.fn() },
  school: { findFirst: vi.fn() },
  attendanceRequest: { findMany: vi.fn() },
  message: { create: vi.fn(), findMany: vi.fn() },
  messageAttachment: { createMany: vi.fn() },
  group: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  studentGroupLink: { createMany: vi.fn(), deleteMany: vi.fn() },
  yearGroup: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const firebaseMock = {
  sendPushNotification: vi.fn(),
  removeInvalidTokens: vi.fn(),
}
vi.mock('../src/services/firebase', () => firebaseMock)

// notify.ts is exercised natively elsewhere; here we assert the partner
// broadcast fan-out calls it once per resolved target with the right target.
const notifyMock = { sendNotification: vi.fn() }
vi.mock('../src/services/notify', () => notifyMock)

// sanitizeRichText is the real XSS-defense; stub it to an identity passthrough
// so we can assert the exact stored content (the markdown→HTML from `marked`,
// which runs for real) without pulling in sanitize-html.
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))

// Storage + validation for the partner upload endpoint.
const storageMock = { uploadFile: vi.fn(), generateKey: vi.fn((p: string, n: string) => `${p}/${n}`) }
vi.mock('../src/services/storage', () => storageMock)
const uploadValidationMock = { checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: ['application/pdf'] }
vi.mock('../src/services/uploadValidation', () => uploadValidationMock)

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
  storageMock.uploadFile.mockResolvedValue('https://cdn.example/message-attachments/a.pdf')
  uploadValidationMock.checkUpload.mockReturnValue({ valid: true })
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
        // STAFF-typed threads only — an ILSA's private threads never count here.
        kind: 'STAFF',
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
        staffId: 'staff-1',
        parent: { name: 'Amina Dad' },
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
        lastMessageText: 'Thanks!',
        lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        // Two unread inbound messages (readAt null); the actor is the primary staff.
        messages: [
          { readAt: null, createdAt: new Date('2026-08-14T09:00:00.000Z') },
          { readAt: null, createdAt: new Date('2026-08-14T09:05:00.000Z') },
        ],
        participants: [{ userId: 'g-1', role: 'PARENT', lastReadAt: null }],
      },
      {
        id: 'c-2',
        staffId: 'staff-1',
        parent: { name: 'No Student' },
        student: null,
        lastMessageText: null,
        lastMessageAt: new Date('2026-08-13T10:00:00.000Z'),
        messages: [],
        participants: [],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff'))
    expect(res.status).toBe(200)
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    // Non-admin: own non-archived threads OR threads they've been CC'd on —
    // STAFF-typed only (ILSA threads excluded).
    expect(where).toEqual({
      kind: 'STAFF',
      OR: [
        { staffId: 'staff-1', archivedByStaff: false },
        { participants: { some: { userId: 'staff-1', role: 'STAFF', archivedAt: null } } },
      ],
    })
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
          sharedCount: 1,
          ccd: false,
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
          sharedCount: 0,
          ccd: false,
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
        participants: [],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff'))
    expect(Object.keys(res.body.threads[0]).sort()).toEqual(
      ['ccd', 'className', 'hubClassId', 'id', 'lastMessageAt', 'lastMessageText', 'parentName', 'sharedCount', 'studentName', 'unread'].sort(),
    )
  })

  // Oversight is an audit measure, not the default view: an admin's Desk inbox
  // shows THEIR threads, and the whole school only when they ask for it.
  it('an admin sees only their own threads by default', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-admin'))
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where).toEqual({
      kind: 'STAFF',
      OR: [
        { staffId: 'admin-1', archivedByStaff: false },
        { participants: { some: { userId: 'admin-1', role: 'STAFF', archivedAt: null } } },
      ],
    })
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('scope=school gives an admin the whole school — and writes an audit row', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-admin&scope=school'))
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where).toEqual({
      kind: 'STAFF', archivedByStaff: false, schoolId: 'sch-1',
    })
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'admin-1', resourceType: 'CONVERSATION', schoolId: 'sch-1',
      metadata: { event: 'ADMIN_INBOX_AUDIT', view: 'list' },
    })
  })

  it('scope=school does nothing for a non-admin — no widening, no audit row', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-staff&scope=school'))
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where.OR).toEqual([
      { staffId: 'staff-1', archivedByStaff: false },
      { participants: { some: { userId: 'staff-1', role: 'STAFF', archivedAt: null } } },
    ])
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
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
    // Gate: STAFF-typed, own thread OR a thread they're a participant of (no
    // admin branch for plain staff). `kind: 'STAFF'` keeps ILSA threads unseen.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-x',
      kind: 'STAFF',
      OR: [{ staffId: 'staff-1' }, { participants: { some: { userId: 'staff-1' } } }],
    })
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
  })

  it("an admin opening someone else's thread needs the audit scope", async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-admin'))
    expect(res.status).toBe(404)
    // Own/CC only — no school-wide branch by default.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-1',
      kind: 'STAFF',
      OR: [{ staffId: 'admin-1' }, { participants: { some: { userId: 'admin-1' } } }],
    })
  })

  it('scope=school lets an admin read it, logs the access, and marks NOTHING read', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      staffId: 'someone-else',
      parent: { name: 'Dad' },
      student: { firstName: 'A', lastName: 'K', class: { name: '1A' } },
      participants: [],
      messages: [],
    })
    const res = await auth(
      request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-admin&scope=school'),
    )
    expect(res.status).toBe(200)
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-1', kind: 'STAFF', schoolId: 'sch-1',
    })
    // The teacher whose thread it is keeps their unread state.
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationParticipant.update).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'admin-1', resourceType: 'CONVERSATION', resourceId: 'c-1',
      metadata: { event: 'ADMIN_INBOX_AUDIT', view: 'thread' },
    })
  })

  it('marks inbound messages read, returns soft-deleted as tombstones, and renames attachment fields', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parent: { name: 'Amina Dad' },
      student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      participants: [{ user: { name: 'Amina Mum' } }],
      messages: [
        {
          id: 'm-1', senderId: 'p-1', content: 'Hello', createdAt: new Date('2026-08-14T09:00:00.000Z'),
          deletedAt: null, sender: { name: 'Amina Dad' },
          attachments: [{ fileName: 'note.pdf', fileUrl: 'https://x/note.pdf', fileType: 'application/pdf', fileSize: 1234 }],
          reactions: [],
        },
        {
          id: 'm-2', senderId: 'staff-1', content: 'Hi there', createdAt: new Date('2026-08-14T09:05:00.000Z'),
          deletedAt: null, sender: { name: 'Ms Noor' }, attachments: [], reactions: [],
        },
        {
          // Withdrawn by the parent: comes back, but says nothing.
          id: 'm-3', senderId: 'p-1', content: 'Sent by mistake', createdAt: new Date('2026-08-14T09:10:00.000Z'),
          deletedAt: new Date('2026-08-14T09:11:00.000Z'), sender: { name: 'Amina Dad' },
          attachments: [{ fileName: 'oops.pdf', fileUrl: 'https://x/oops.pdf', fileType: 'application/pdf', fileSize: 9 }],
          reactions: [],
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
    // Soft-deleted are NOT filtered out any more: Desk needs to tell "withdrawn"
    // from "never existed", or a teacher gets a notification and an empty thread.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].include.messages.where).toBeUndefined()
    expect(res.body.thread).toEqual({ id: 'c-1', parentName: 'Amina Dad', studentName: 'Amina Khan', className: '1A', sharedWith: ['Amina Mum'], ccStaff: [] })
    expect(res.body.messages).toEqual([
      {
        id: 'm-1', senderName: 'Amina Dad', mine: false, content: 'Hello', sentAt: '2026-08-14T09:00:00.000Z',
        deletedAt: null,
        attachments: [{ name: 'note.pdf', url: 'https://x/note.pdf', type: 'application/pdf', size: 1234 }],
      },
      { id: 'm-2', senderName: 'Ms Noor', mine: true, content: 'Hi there', sentAt: '2026-08-14T09:05:00.000Z', deletedAt: null, attachments: [] },
      // The withdrawal keeps its place and its authorship, and carries NO
      // content and NO attachment URLs — sending either would undo it.
      {
        id: 'm-3', senderName: 'Amina Dad', mine: false, content: '', deleted: true,
        deletedAt: '2026-08-14T09:11:00.000Z', sentAt: '2026-08-14T09:10:00.000Z', attachments: [],
      },
    ])
  })

  it('locks the EXACT key set of thread, a message, and an attachment', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1',
      parent: { name: 'Dad' },
      student: { firstName: 'A', lastName: 'K', class: { name: '1A' } },
      participants: [],
      messages: [
        {
          id: 'm-1', senderId: 'p-1', content: 'Hi', createdAt: new Date('2026-08-14T09:00:00.000Z'),
          deletedAt: null, sender: { name: 'Dad' },
          attachments: [{ fileName: 'n.pdf', fileUrl: 'https://x/n.pdf', fileType: 'application/pdf', fileSize: 1 }],
          reactions: [],
        },
      ],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-staff'))
    expect(Object.keys(res.body.thread).sort()).toEqual(['ccStaff', 'className', 'id', 'parentName', 'sharedWith', 'studentName'].sort())
    expect(Object.keys(res.body.messages[0]).sort()).toEqual(
      // `deleted` is absent on a live message (undefined, so JSON drops it);
      // `deletedAt` is always sent, null when live. `reactions` is absent too
      // when there are none — Desk reads a missing key as "no reactions".
      ['attachments', 'content', 'deletedAt', 'id', 'mine', 'senderName', 'sentAt'].sort(),
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
      data: { schoolId: 'sch-1', parentId: 'p-1', staffId: 'staff-1', studentId: null, schoolContactId: null, kind: 'STAFF' },
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
    expect(prismaMock.parentStudentLink.findFirst).toHaveBeenCalledWith({ where: { studentId: 'stu-1' }, select: { userId: true }, orderBy: { createdAt: 'asc' } })
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
    // isTest:false hides Test Students from the Desk recipient picker.
    expect(where).toEqual({ schoolId: 'sch-1', isTest: false, classId: { in: ['cls-A', 'cls-B'] } })
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
    expect(where).toEqual({ schoolId: 'sch-1', isTest: false })
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

// Partner broadcast — Desk sends native broadcasts; Message is single-target per
// row, so we fan out one row per resolved target. Every target validated to the
// actor's school up front; a single bad target rejects the whole broadcast.
describe('POST /api/partner/messages', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    let n = 0
    prismaMock.message.create.mockImplementation(async () => ({ id: `msg-${++n}` }))
    prismaMock.messageAttachment.createMany.mockResolvedValue({ count: 0 })
    prismaMock.class.findMany.mockResolvedValue([])
    prismaMock.group.findMany.mockResolvedValue([])
    prismaMock.yearGroup.findFirst.mockResolvedValue(null)
  })

  it('403 on an unresolvable / parent actor (no rows created)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'ghost', title: 'T', content: 'C', audience: { wholeSchool: true } })
    expect(res.status).toBe(403)
    expect(prismaMock.message.create).not.toHaveBeenCalled()

    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'p-1', role: 'PARENT', schoolId: 'sch-1', name: 'Dad' })
    const res2 = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-p', title: 'T', content: 'C', audience: { wholeSchool: true } })
    expect(res2.status).toBe(403)
  })

  it('400 on an empty audience (no rows)', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-staff', title: 'T', content: 'C', audience: {} })
    expect(res.status).toBe(400)
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })

  it('fans out one row per resolved target (classes + group + whole-school) with the right targetClass/target ids, one notification each', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'cls-1', name: '1A' },
      { id: 'cls-2', name: '1B' },
    ])
    prismaMock.group.findMany.mockResolvedValue([{ id: 'g-1', name: 'Choir' }])

    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hu-staff',
      title: 'Sports Day',
      content: '**Bring water**',
      audience: { classHubIds: ['hc-1', 'hc-2'], groupIds: ['g-1'], wholeSchool: true },
      isUrgent: true,
      attachments: [{ fileName: 'a.pdf', fileUrl: 'https://x/a.pdf', fileType: 'application/pdf', fileSize: 9 }],
    })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ created: 4 })

    // Validation was school-scoped and up front.
    expect(prismaMock.class.findMany).toHaveBeenCalledWith({
      where: { hubClassId: { in: ['hc-1', 'hc-2'] }, schoolId: 'sch-1' },
      select: { id: true, name: true },
    })
    expect(prismaMock.group.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['g-1'] }, schoolId: 'sch-1' },
      select: { id: true, name: true },
    })

    // One Message row per target, in order class → group → whole-school.
    expect(prismaMock.message.create).toHaveBeenCalledTimes(4)
    const rows = prismaMock.message.create.mock.calls.map(c => c[0].data)
    expect(rows.map(r => [r.targetClass, r.classId ?? null, r.groupId ?? null, r.yearGroupId ?? null])).toEqual([
      ['1A', 'cls-1', null, null],
      ['1B', 'cls-2', null, null],
      ['Choir', null, 'g-1', null],
      ['Whole School', null, null, null],
    ])
    // Shared per-row fields: markdown converted → HTML (bold survives the
    // sanitizer), actor identity, never pinned, urgent honoured.
    for (const r of rows) {
      expect(r).toMatchObject({
        content: expect.stringContaining('<strong>Bring water</strong>'),
        senderId: 'staff-1',
        senderName: 'Ms Noor',
        schoolId: 'sch-1',
        isPinned: false,
        isUrgent: true,
      })
    }
    // Attachments written for every row.
    expect(prismaMock.messageAttachment.createMany).toHaveBeenCalledTimes(4)
    // A notification per row, with that row's target.
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(4)
    const targets = notifyMock.sendNotification.mock.calls.map(c => c[0].target)
    expect(targets).toEqual([
      { targetClass: '1A', classId: 'cls-1', groupId: undefined, yearGroupId: undefined, schoolId: 'sch-1' },
      { targetClass: '1B', classId: 'cls-2', groupId: undefined, yearGroupId: undefined, schoolId: 'sch-1' },
      { targetClass: 'Choir', classId: undefined, groupId: 'g-1', yearGroupId: undefined, schoolId: 'sch-1' },
      { targetClass: 'Whole School', classId: undefined, groupId: undefined, yearGroupId: undefined, schoolId: 'sch-1' },
    ])
  })

  it('a year-group audience creates a single year-group row', async () => {
    prismaMock.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1', name: 'Year 1' })
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-staff', title: 'T', content: 'C', audience: { yearGroupId: 'yg-1' } })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ created: 1 })
    expect(prismaMock.message.create.mock.calls[0][0].data).toMatchObject({ targetClass: 'Year 1', yearGroupId: 'yg-1' })
  })

  it('an unknown / cross-school class target → 400 and NO rows created', async () => {
    prismaMock.class.findMany.mockResolvedValue([]) // hc-x resolves to nothing in this school
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-staff', title: 'T', content: 'C', audience: { classHubIds: ['hc-x'] } })
    expect(res.status).toBe(400)
    expect(prismaMock.message.create).not.toHaveBeenCalled()
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })
})

describe('GET /api/partner/messages/sent', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('403 on a bad actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/messages/sent?hub_user_id=ghost'))
    expect(res.status).toBe(403)
  })

  it('returns the sender\'s rows with ackCount from _count, key-set locked', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.message.findMany.mockResolvedValue([
      { id: 'm-1', title: 'Sports Day', targetClass: '1A', createdAt: new Date('2026-08-14T10:00:00.000Z'), _count: { acknowledgments: 5 } },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/messages/sent?hub_user_id=hu-staff'))
    expect(res.status).toBe(200)
    // Scoped to this sender + school, newest first, capped.
    expect(prismaMock.message.findMany.mock.calls[0][0]).toMatchObject({
      where: { senderId: 'staff-1', schoolId: 'sch-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    expect(res.body.messages[0]).toEqual({
      id: 'm-1', title: 'Sports Day', audienceLabel: '1A', sentAt: '2026-08-14T10:00:00.000Z', ackCount: 5,
    })
    expect(Object.keys(res.body.messages[0]).sort()).toEqual(['ackCount', 'audienceLabel', 'id', 'sentAt', 'title'])
  })
})

describe('GET /api/partner/groups', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('400 when school_id is missing', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/groups'))
    expect(res.status).toBe(400)
  })

  it('unknown school → empty groups, not an error', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/groups?school_id=ghost'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ groups: [] })
  })

  it('lists active groups with memberCount, resolved by Hub-or-Connect id, key-set locked', async () => {
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1' })
    prismaMock.group.findMany.mockResolvedValue([
      { id: 'g-1', name: 'Choir', _count: { studentMembers: 3 } },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/groups?school_id=hub-1'))
    expect(res.status).toBe(200)
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ hubSchoolId: 'hub-1' }, { id: 'hub-1' }] },
      select: { id: true },
    })
    // Only active groups are listed.
    expect(prismaMock.group.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'sch-1', isActive: true })
    expect(res.body.groups[0]).toEqual({ id: 'g-1', name: 'Choir', memberCount: 3 })
    expect(Object.keys(res.body.groups[0]).sort()).toEqual(['id', 'memberCount', 'name'])
  })
})

describe('POST /api/partner/groups', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.studentGroupLink.createMany.mockResolvedValue({ count: 0 })
  })

  it('403 on a bad actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).post('/api/partner/groups')).send({ hub_user_id: 'ghost', name: 'X', pupilHubIds: [] })
    expect(res.status).toBe(403)
  })

  it('maps Hub pupil ids → internal Student ids and creates links with the internal ids', async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }])
    prismaMock.group.create.mockResolvedValue({ id: 'g-new' })
    const res = await auth(request(makeApp()).post('/api/partner/groups'))
      .send({ hub_user_id: 'hu-staff', name: 'Choir', pupilHubIds: ['hp-1', 'hp-2'] })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: 'g-new' })
    // Resolved by hubPupilId, scoped to the actor's school.
    expect(prismaMock.student.findMany).toHaveBeenCalledWith({
      where: { hubPupilId: { in: ['hp-1', 'hp-2'] }, schoolId: 'sch-1' },
      select: { id: true },
    })
    expect(prismaMock.group.create).toHaveBeenCalledWith({
      data: { name: 'Choir', schoolId: 'sch-1' },
      select: { id: true },
    })
    // Links carry the INTERNAL student ids, never the Hub pupil ids.
    expect(prismaMock.studentGroupLink.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 's-1', groupId: 'g-new' }, { studentId: 's-2', groupId: 'g-new' }],
      skipDuplicates: true,
    })
  })

  it('a cross-school / unknown pupil → 400 and no group created', async () => {
    prismaMock.student.findMany.mockResolvedValue([{ id: 's-1' }]) // only one of two resolves
    const res = await auth(request(makeApp()).post('/api/partner/groups'))
      .send({ hub_user_id: 'hu-staff', name: 'Choir', pupilHubIds: ['hp-1', 'hp-x'] })
    expect(res.status).toBe(400)
    expect(prismaMock.group.create).not.toHaveBeenCalled()
  })

  it('duplicate group name in-school → 409', async () => {
    prismaMock.student.findMany.mockResolvedValue([])
    prismaMock.group.create.mockRejectedValue({ code: 'P2002' })
    const res = await auth(request(makeApp()).post('/api/partner/groups'))
      .send({ hub_user_id: 'hu-staff', name: 'Choir', pupilHubIds: [] })
    expect(res.status).toBe(409)
  })
})

describe('GET /api/partner/groups/:id', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
  })

  it('403 on a bad actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/groups/g-1?hub_user_id=ghost'))
    expect(res.status).toBe(403)
  })

  it('404 when the group is in another school', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/groups/g-x?hub_user_id=hu-staff'))
    expect(res.status).toBe(404)
    expect(prismaMock.group.findFirst.mock.calls[0][0].where).toEqual({ id: 'g-x', schoolId: 'sch-1' })
  })

  it('lists members keyed on pupilHubId (never the internal studentId), key-set locked', async () => {
    prismaMock.group.findFirst.mockResolvedValue({
      id: 'g-1',
      name: 'Choir',
      studentMembers: [
        { student: { hubPupilId: 'hp-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } } },
        { student: { hubPupilId: 'hp-2', firstName: 'Bilal', lastName: 'Khan', class: null } },
      ],
    })
    const res = await auth(request(makeApp()).get('/api/partner/groups/g-1?hub_user_id=hu-staff'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'g-1',
      name: 'Choir',
      members: [
        { pupilHubId: 'hp-1', studentName: 'Amina Khan', className: '1A' },
        { pupilHubId: 'hp-2', studentName: 'Bilal Khan', className: null },
      ],
    })
    // Key-set lock — exactly these three member fields, no internal id / other PII.
    expect(Object.keys(res.body.members[0]).sort()).toEqual(['className', 'pupilHubId', 'studentName'])
  })
})

describe('PATCH /api/partner/groups/:id', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g-1' })
    prismaMock.group.update.mockResolvedValue({ id: 'g-1' })
    prismaMock.studentGroupLink.createMany.mockResolvedValue({ count: 0 })
    prismaMock.studentGroupLink.deleteMany.mockResolvedValue({ count: 0 })
  })

  it('403 on a bad actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1')).send({ hub_user_id: 'ghost' })
    expect(res.status).toBe(403)
  })

  it('404 when the group is in another school', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-x')).send({ hub_user_id: 'hu-staff', name: 'New' })
    expect(res.status).toBe(404)
  })

  it('renames and adds/removes members by Hub pupil id (mapped to internal ids)', async () => {
    prismaMock.student.findMany
      .mockResolvedValueOnce([{ id: 's-1' }]) // adds: hp-1
      .mockResolvedValueOnce([{ id: 's-9' }]) // removes: hp-9
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hu-staff', name: 'Choir B', addPupilHubIds: ['hp-1'], removePupilHubIds: ['hp-9'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prismaMock.group.update).toHaveBeenCalledWith({ where: { id: 'g-1' }, data: { name: 'Choir B' } })
    expect(prismaMock.studentGroupLink.createMany).toHaveBeenCalledWith({
      data: [{ studentId: 's-1', groupId: 'g-1' }],
      skipDuplicates: true,
    })
    expect(prismaMock.studentGroupLink.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'g-1', studentId: { in: ['s-9'] } },
    })
  })

  it('a cross-school pupil in addPupilHubIds → 400, no writes', async () => {
    prismaMock.student.findMany.mockResolvedValueOnce([]) // hp-x resolves to nothing
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hu-staff', addPupilHubIds: ['hp-x'] })
    expect(res.status).toBe(400)
    expect(prismaMock.group.update).not.toHaveBeenCalled()
    expect(prismaMock.studentGroupLink.createMany).not.toHaveBeenCalled()
  })

  it('a rename clash → 409', async () => {
    prismaMock.group.update.mockRejectedValue({ code: 'P2002' })
    const res = await auth(request(makeApp()).patch('/api/partner/groups/g-1'))
      .send({ hub_user_id: 'hu-staff', name: 'Taken' })
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/partner/groups/:id', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
  })

  it('403 on a bad actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).delete('/api/partner/groups/g-1')).send({ hub_user_id: 'ghost' })
    expect(res.status).toBe(403)
  })

  it('404 when the group is in another school', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).delete('/api/partner/groups/g-x')).send({ hub_user_id: 'hu-staff' })
    expect(res.status).toBe(404)
  })

  it('archives (isActive:false) rather than hard-deleting', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g-1' })
    prismaMock.group.update.mockResolvedValue({ id: 'g-1' })
    const res = await auth(request(makeApp()).delete('/api/partner/groups/g-1')).send({ hub_user_id: 'hu-staff' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prismaMock.group.update).toHaveBeenCalledWith({ where: { id: 'g-1' }, data: { isActive: false } })
  })
})

describe('POST /api/partner/messages — markdown', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('converts markdown bullets to sanitized HTML (<ul><li>) in the stored content', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' })
    const res = await auth(request(makeApp()).post('/api/partner/messages')).send({
      hub_user_id: 'hu-staff',
      title: 'Swimming',
      content: '- Kit\n- Towel',
      audience: { wholeSchool: true },
    })
    expect(res.status).toBe(201)
    const stored = prismaMock.message.create.mock.calls[0][0].data.content as string
    expect(stored).toContain('<ul>')
    expect(stored).toContain('<li>Kit</li>')
    expect(stored).toContain('<li>Towel</li>')
  })
})

describe('POST /api/partner/inbox/upload', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  it('401 without a partner token', async () => {
    const res = await request(makeApp())
      .post('/api/partner/inbox/upload')
      .attach('file', Buffer.from('%PDF-1.4'), 'note.pdf')
    expect(res.status).toBe(401)
  })

  it('400 when no file is attached', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/inbox/upload'))
    expect(res.status).toBe(400)
  })

  it('400 when validation rejects the file', async () => {
    uploadValidationMock.checkUpload.mockReturnValue({ valid: false, reason: 'unsupported type' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/upload'))
      .attach('file', Buffer.from('MZ'), 'bad.exe')
    expect(res.status).toBe(400)
    expect(storageMock.uploadFile).not.toHaveBeenCalled()
  })

  it('stores a valid file and returns the attachment descriptor', async () => {
    const res = await auth(request(makeApp()).post('/api/partner/inbox/upload'))
      .attach('file', Buffer.from('%PDF-1.4 body'), 'permission.pdf')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      fileName: 'permission.pdf',
      fileUrl: 'https://cdn.example/message-attachments/a.pdf',
      fileType: 'application/pdf',
      fileSize: expect.any(Number),
    })
    expect(storageMock.uploadFile).toHaveBeenCalled()
  })
})

// Staff CC (Phase 2) — a CC'd staff member (a STAFF-role participant who is NOT
// the primary staff) must see, open, and reply to the thread via the Desk
// partner API, exactly like the primary staff, using their OWN participant
// read-state (never the primary staff's flags).
describe('Staff CC visibility (partner)', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
  const CC = { id: 'cc-1', role: 'STAFF', schoolId: 'sch-1', name: 'CC Teacher' }

  it('GET /inbox/threads ORs own threads with CC’d threads; unread uses the participant lastReadAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue(CC)
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-1', staffId: 'primary-staff',
        parent: { name: 'A Parent' },
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
        lastMessageText: 'Hi', lastMessageAt: new Date('2026-08-19T10:00:00.000Z'),
        // CC actor reads via their participant row (lastReadAt gates unread).
        participants: [{ userId: 'cc-1', role: 'STAFF', lastReadAt: new Date('2026-08-19T09:00:00.000Z') }],
        messages: [
          { readAt: null, createdAt: new Date('2026-08-19T09:30:00.000Z') }, // after lastReadAt ⇒ unread
          { readAt: null, createdAt: new Date('2026-08-19T08:00:00.000Z') }, // before ⇒ read
        ],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-cc'))
    expect(res.status).toBe(200)
    // Non-admin OR-clause includes the STAFF-participant branch.
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where.OR).toEqual([
      { staffId: 'cc-1', archivedByStaff: false },
      { participants: { some: { userId: 'cc-1', role: 'STAFF', archivedAt: null } } },
    ])
    // Unread counted from the participant's lastReadAt; STAFF CC excluded from sharedCount.
    expect(res.body.threads[0]).toMatchObject({ id: 'c-1', unread: 1, sharedCount: 0 })
  })

  it('GET /inbox/threads/:id: a CC opens via staffThreadWhere and stamps their participant lastReadAt', async () => {
    prismaMock.user.findUnique.mockResolvedValue(CC)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', staffId: 'primary-staff',
      parent: { name: 'A Parent' },
      student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      participants: [{ id: 'part-1', userId: 'cc-1', role: 'STAFF', user: { name: 'CC Teacher' } }],
      messages: [],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-1?hub_user_id=hu-cc'))
    expect(res.status).toBe(200)
    // staffThreadWhere authorizes the CC via the participants branch.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where.OR).toContainEqual(
      { participants: { some: { userId: 'cc-1' } } },
    )
    // Read-state stamped on the participant row, not ConversationMessage.readAt.
    expect(prismaMock.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' }, data: { lastReadAt: expect.any(Date) },
    })
    expect(prismaMock.conversationMessage.updateMany).not.toHaveBeenCalled()
    // STAFF CCs are excluded from sharedWith (they are not co-guardians).
    expect(res.body.thread.sharedWith).toEqual([])
  })

  it('POST /inbox/threads/:id/messages: a CC reply notifies the parent + primary staff (not the sender)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(CC)
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-1', parentId: 'p-1', staffId: 'primary-staff', schoolId: 'sch-1',
      mutedByParent: false, mutedByStaff: false,
      parent: { id: 'p-1', name: 'A Parent' }, staff: { id: 'primary-staff', name: 'Primary Teacher' },
      schoolContact: null,
      participants: [{ userId: 'cc-1', mutedAt: null }],
    })
    prismaMock.conversationMessage.create.mockResolvedValue({
      id: 'msg-9', senderId: 'cc-1', content: 'Chiming in', createdAt: new Date('2026-08-19T11:00:00.000Z'),
    })
    prismaMock.deviceToken.findMany.mockResolvedValue([])

    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages'))
      .send({ hub_user_id: 'hu-cc', content: 'Chiming in' })
    expect(res.status).toBe(201)
    const notifiedUserIds = prismaMock.notification.create.mock.calls.map(c => c[0].data.userId).sort()
    expect(notifiedUserIds).toEqual(['p-1', 'primary-staff'])
    expect(notifiedUserIds).not.toContain('cc-1')
  })
})

/**
 * Reactions on the partner surface.
 *
 * The thread read used to strip them deliberately — Desk got a display-only
 * shape. Desk now renders them, so both apps must agree on what a message says,
 * which is why the emoji allow-list is imported from the parent inbox rather
 * than restated here.
 *
 * A reaction is NOT an acknowledgement: nothing here touches read state, the
 * "who has responded" counts, or notifications.
 */
describe('reactions on a partner thread', () => {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'c-1' })
    prismaMock.conversationMessage.findFirst.mockResolvedValue({ id: 'm-1', deletedAt: null })
    prismaMock.messageReaction.upsert.mockResolvedValue({})
    prismaMock.messageReaction.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.messageReaction.findMany.mockResolvedValue([
      { emoji: 'heart', userId: 'staff-1' },
      { emoji: 'heart', userId: 'p-1' },
    ])
  })

  const react = (body: Record<string, unknown>) =>
    auth(request(makeApp()).post('/api/partner/inbox/threads/c-1/messages/m-1/react'))
      .send({ hub_user_id: 'hu-staff', emoji: 'heart', ...body })

  it('adds a reaction and returns the summary the read uses', async () => {
    const res = await react({})

    expect(res.status).toBe(200)
    // `reacted` is relative to the caller, who is one of the two hearts.
    expect(res.body.reactions).toEqual({ heart: { count: 2, reacted: true } })
  })

  it('is idempotent — reacting twice is the same state, not an error', async () => {
    await react({})
    expect(prismaMock.messageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId_userId_emoji: { messageId: 'm-1', userId: 'staff-1', emoji: 'heart' } },
        update: {},
      }),
    )
  })

  // If either app invented its own list the two would disagree about what a
  // message says — one rendering a pill the other cannot name.
  it('refuses an emoji outside the shared allow-list', async () => {
    const res = await react({ emoji: 'partyparrot' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('unsupported_emoji')
    expect(res.body.allowed).toContain('heart')
    expect(prismaMock.messageReaction.upsert).not.toHaveBeenCalled()
  })

  it('404s on a thread the actor cannot open', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    const res = await react({})
    expect(res.status).toBe(404)
    expect(prismaMock.messageReaction.upsert).not.toHaveBeenCalled()
  })

  // Borrowing a visible thread must not reach a message in another one.
  it('scopes the message lookup to the thread', async () => {
    await react({})
    expect(prismaMock.conversationMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm-1', conversationId: 'c-1' } }),
    )
  })

  // A withdrawn message shows no reactions, so it should not gain one.
  it('409s on a withdrawn message', async () => {
    prismaMock.conversationMessage.findFirst.mockResolvedValue({ id: 'm-1', deletedAt: new Date() })
    const res = await react({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('message_withdrawn')
  })

  it('403s for an id that is not a recognised actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await react({})
    expect(res.status).toBe(403)
  })

  it('removes a reaction, and removing a missing one still succeeds', async () => {
    prismaMock.messageReaction.findMany.mockResolvedValue([])

    const res = await auth(
      request(makeApp()).delete('/api/partner/inbox/threads/c-1/messages/m-1/react?hub_user_id=hu-staff&emoji=heart'),
    )

    expect(res.status).toBe(200)
    expect(res.body.reactions).toEqual({})
    expect(prismaMock.messageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'm-1', userId: 'staff-1', emoji: 'heart' },
    })
  })
})
