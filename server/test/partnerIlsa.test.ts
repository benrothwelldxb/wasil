import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// Connect's slice of ADR 0006 — the ILSA (Learning Support Assistant) as a
// pupil-scoped messaging actor over the SAME partner inbox routes, plus the
// audited oversight route. Prisma + firebase are mocked. These tests pin the
// security boundary: an ILSA reaches ONLY their one pupil's guardian(s), their
// private thread is invisible to staff, and staff can never slip into the ILSA
// actor (nor an ILSA into the staff surfaces).

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  ilsaLink: { findFirst: vi.fn(), findMany: vi.fn() },
  conversation: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  conversationMessage: { create: vi.fn(), updateMany: vi.fn() },
  conversationParticipant: { update: vi.fn() },
  conversationAttachment: { createMany: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  class: { findFirst: vi.fn() },
  school: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  group: { findMany: vi.fn(), create: vi.fn() },
  studentGroupLink: { createMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const firebaseMock = { sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }
vi.mock('../src/services/firebase', () => firebaseMock)
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)

// An ILSA-role user, and the ACTIVE link that scopes them to one pupil.
const ILSA_USER = { id: 'ilsa-1', role: 'ILSA', schoolId: 'sch-1', name: 'Ms Support' }
const ILSA_LINK = { studentId: 'stu-1', hubPupilId: 'hp-1' }
const ADMIN = { id: 'admin-1', role: 'ADMIN', schoolId: 'sch-1', name: 'Head' }
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }

/** Wire the mocks so `resolveActor(hub_user_id)` yields the ILSA actor: the
 * staff resolver rejects role ILSA, then the ILSA resolver finds the active link. */
function asIlsa() {
  prismaMock.user.findUnique.mockResolvedValue(ILSA_USER)
  prismaMock.ilsaLink.findFirst.mockResolvedValue(ILSA_LINK)
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  firebaseMock.sendPushNotification.mockResolvedValue({ failedTokens: [] })
  firebaseMock.removeInvalidTokens.mockResolvedValue(undefined)
})

describe('ILSA actor resolution + least privilege', () => {
  it('an ILSA with an active link resolves for the inbox recipients route', async () => {
    asIlsa()
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' },
      parentLinks: [{ user: { name: 'Sara Khan' } }],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hu-ilsa'))
    expect(res.status).toBe(200)
    // The ILSA resolver reads the active link scoped to their user.
    expect(prismaMock.ilsaLink.findFirst).toHaveBeenCalledWith({
      where: { userId: 'ilsa-1', active: true },
      select: { studentId: true, hubPupilId: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('an ILSA with NO active link (deactivated/unlinked) → 403 (messaging cut off)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ILSA_USER)
    prismaMock.ilsaLink.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-ilsa'))
    expect(res.status).toBe(403)
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })

  it('an ILSA can NEVER reach the staff-only broadcast surface (403, no rows)', async () => {
    asIlsa()
    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-ilsa', title: 'T', content: 'C', audience: { wholeSchool: true } })
    expect(res.status).toBe(403)
  })

  it('an ILSA can NEVER reach the staff-only group surface (403)', async () => {
    asIlsa()
    const res = await auth(request(makeApp()).post('/api/partner/groups'))
      .send({ hub_user_id: 'hu-ilsa', name: 'X', pupilHubIds: [] })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/partner/inbox/recipients (ILSA)', () => {
  it('returns EXACTLY the one linked pupil, ignoring scope, key-set locked', async () => {
    asIlsa()
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' },
      parentLinks: [{ user: { name: 'Sara Khan' } }],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hu-ilsa&scope=school'))
    expect(res.status).toBe(200)
    // Scoped to the ILSA's one pupil in their school — never the class picker.
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toEqual({ id: 'stu-1', schoolId: 'sch-1' })
    expect(prismaMock.staffClassAssignment.findMany).not.toHaveBeenCalled()
    expect(res.body.recipients).toEqual([
      { studentId: 'stu-1', studentName: 'Amina Khan', className: '1A', parentName: 'Sara Khan' },
    ])
    expect(Object.keys(res.body.recipients[0]).sort()).toEqual(['className', 'parentName', 'studentId', 'studentName'])
  })
})

describe('GET /api/partner/inbox/threads (ILSA)', () => {
  it('lists ONLY the ILSA-typed threads on the ILSA (staffId slot)', async () => {
    asIlsa()
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-ilsa', staffId: 'ilsa-1', parent: { name: 'Sara Khan' },
        student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A', hubClassId: 'hc-1' } },
        lastMessageText: 'Hi', lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        messages: [{ readAt: null, createdAt: new Date('2026-08-14T09:00:00.000Z') }],
        participants: [],
      },
    ])
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-ilsa&class_id=hc-9'))
    expect(res.status).toBe(200)
    // The gate is ILSA-typed threads on this ILSA — class_id is ignored, and a
    // STAFF (teacher↔parent) thread can never match.
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where).toEqual({ staffId: 'ilsa-1', kind: 'ILSA' })
    expect(prismaMock.class.findFirst).not.toHaveBeenCalled()
    expect(res.body.threads[0]).toMatchObject({ id: 'c-ilsa', parentName: 'Sara Khan', unread: 1, ccd: false })
  })
})

describe('GET /api/partner/inbox/threads/:id (ILSA)', () => {
  it('a STAFF (teacher↔parent) thread is invisible to the ILSA → 404', async () => {
    asIlsa()
    prismaMock.conversation.findFirst.mockResolvedValue(null) // gate excludes it
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-staff?hub_user_id=hu-ilsa'))
    expect(res.status).toBe(404)
    // Gate: this ILSA's own ILSA-typed thread only.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'c-staff', kind: 'ILSA', staffId: 'ilsa-1',
    })
  })

  it('reads the ILSA thread + marks inbound read (two-party model)', async () => {
    asIlsa()
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-ilsa', staffId: 'ilsa-1',
      parent: { name: 'Sara Khan' },
      student: { firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } },
      participants: [],
      messages: [
        { id: 'm-1', senderId: 'p-1', content: 'Hello', createdAt: new Date('2026-08-14T09:00:00.000Z'), sender: { name: 'Sara Khan' }, attachments: [] },
      ],
    })
    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads/c-ilsa?hub_user_id=hu-ilsa'))
    expect(res.status).toBe(200)
    // The ILSA is the primary (staff-side) party → two-party readAt model.
    expect(prismaMock.conversationMessage.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'c-ilsa', senderId: { not: 'ilsa-1' }, readAt: null },
      data: { readAt: expect.any(Date) },
    })
    expect(res.body.thread).toMatchObject({ parentName: 'Sara Khan', ccStaff: [] })
    expect(res.body.messages[0]).toMatchObject({ senderName: 'Sara Khan', mine: false, content: 'Hello' })
  })
})

describe('POST /api/partner/inbox/threads (ILSA start)', () => {
  it('forces the pupil to the ILSA link + creates an ILSA-typed thread with the guardian', async () => {
    asIlsa()
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({ userId: 'p-1' })
    prismaMock.user.findFirst.mockResolvedValue({ id: 'p-1' }) // guardian is a same-school PARENT
    prismaMock.conversation.findFirst.mockResolvedValue(null)
    prismaMock.conversation.create.mockResolvedValue({ id: 'c-new' })
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads')).send({ hub_user_id: 'hu-ilsa' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'c-new' })
    expect(prismaMock.conversation.create).toHaveBeenCalledWith({
      data: { schoolId: 'sch-1', parentId: 'p-1', staffId: 'ilsa-1', studentId: 'stu-1', schoolContactId: null, kind: 'ILSA' },
    })
  })

  it('an ILSA naming a DIFFERENT pupil → 403 (never another pupil’s guardian)', async () => {
    asIlsa()
    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads'))
      .send({ hub_user_id: 'hu-ilsa', studentId: 'stu-OTHER' })
    expect(res.status).toBe(403)
    expect(prismaMock.conversation.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/partner/inbox/threads/:id/messages (ILSA send)', () => {
  it('sends into the ILSA thread and notifies the guardian — never a teacher', async () => {
    asIlsa()
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: 'c-ilsa', parentId: 'p-1', staffId: 'ilsa-1', schoolId: 'sch-1', mutedByParent: false, mutedByStaff: false,
      parent: { id: 'p-1', name: 'Sara Khan' }, staff: { id: 'ilsa-1', name: 'Ms Support' }, schoolContact: null,
      participants: [],
    })
    prismaMock.conversationMessage.create.mockResolvedValue({ id: 'm-9', senderId: 'ilsa-1', content: 'Hi', createdAt: new Date('2026-08-14T11:00:00.000Z') })
    prismaMock.deviceToken.findMany.mockResolvedValue([{ token: 'tok-1' }])

    const res = await auth(request(makeApp()).post('/api/partner/inbox/threads/c-ilsa/messages'))
      .send({ hub_user_id: 'hu-ilsa', content: 'Hi' })
    expect(res.status).toBe(201)
    // Gate is the ILSA's own thread; message stored under the ILSA's user id.
    expect(prismaMock.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-ilsa', kind: 'ILSA', staffId: 'ilsa-1' })
    expect(prismaMock.conversationMessage.create).toHaveBeenCalledWith({
      data: { conversationId: 'c-ilsa', senderId: 'ilsa-1', content: 'Hi' },
    })
    // The guardian is notified; the sender (ILSA) is not. No teacher is on the thread.
    const notifiedUserIds = prismaMock.notification.create.mock.calls.map(c => c[0].data.userId)
    expect(notifiedUserIds).toEqual(['p-1'])
    expect(prismaMock.notification.create.mock.calls[0][0].data.title).toBe('Message from Ms Support')
  })
})

describe('GET /api/partner/oversight/ilsa-threads', () => {
  it('403 for a non-admin actor (staff cannot use the oversight route)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(STAFF)
    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-staff&pupil_id=hp-1'))
    expect(res.status).toBe(403)
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })

  it('403 when an ILSA tries to read oversight', async () => {
    asIlsa()
    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-ilsa&pupil_id=hp-1'))
    expect(res.status).toBe(403)
  })

  it('400 when pupil_id is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-admin'))
    expect(res.status).toBe(400)
  })

  it('404 when the pupil is unknown in the admin’s school', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.student.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-admin&pupil_id=hp-x'))
    expect(res.status).toBe(404)
    expect(prismaMock.student.findFirst.mock.calls[0][0].where).toEqual({ hubPupilId: 'hp-x', schoolId: 'sch-1' })
  })

  it('403 when school_id cross-check resolves to a different school', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-OTHER' })
    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-admin&pupil_id=hp-1&school_id=other'))
    expect(res.status).toBe(403)
    expect(prismaMock.student.findFirst).not.toHaveBeenCalled()
  })

  it('returns retained threads (deactivated ILSAs flagged) and AUDITS the access', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } })
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-ilsa', staffId: 'ilsa-1', createdAt: new Date('2026-08-01T09:00:00.000Z'), lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        parent: { name: 'Sara Khan' }, staff: { id: 'ilsa-1', name: 'Ms Support' }, participants: [],
        messages: [
          { id: 'm-1', senderId: 'ilsa-1', content: 'Update', createdAt: new Date('2026-08-14T09:00:00.000Z'), deletedAt: null, sender: { name: 'Ms Support' }, attachments: [] },
          { id: 'm-2', senderId: 'p-1', content: 'Thanks', createdAt: new Date('2026-08-14T10:00:00.000Z'), deletedAt: null, sender: { name: 'Sara Khan' }, attachments: [] },
        ],
      },
    ])
    // The ILSA on this thread is NOT in the active-links set → deactivated-but-retained.
    prismaMock.ilsaLink.findMany.mockResolvedValue([])
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-admin&pupil_id=hp-1'))
    expect(res.status).toBe(200)
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'sch-1', kind: 'ILSA', studentId: 'stu-1' })
    expect(res.body.pupil).toEqual({ studentName: 'Amina Khan', className: '1A' })
    expect(res.body.threads[0]).toMatchObject({ id: 'c-ilsa', ilsaName: 'Ms Support', ilsaActive: false, guardianName: 'Sara Khan' })
    // Sender roles derived from the thread's ILSA (staffId) vs guardian.
    expect(res.body.threads[0].messages.map((m: { senderRole: string }) => m.senderRole)).toEqual(['ILSA', 'GUARDIAN'])
    // The access is audited: who, whose pupil, how many threads.
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'admin-1', action: 'CREATE', resourceType: 'ILSA_THREAD', resourceId: 'stu-1', schoolId: 'sch-1',
        metadata: expect.objectContaining({ event: 'OVERSIGHT_ACCESS', pupilHubId: 'hp-1', threadCount: 1 }),
      }),
    }))
  })

  it('keeps a withdrawn message as a tombstone — safeguarding must see it happened', async () => {
    prismaMock.user.findUnique.mockResolvedValue(ADMIN)
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1', firstName: 'Amina', lastName: 'Khan', class: { name: '1A' } })
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'c-ilsa', staffId: 'ilsa-1', createdAt: new Date('2026-08-01T09:00:00.000Z'), lastMessageAt: new Date('2026-08-14T10:00:00.000Z'),
        parent: { name: 'Sara Khan' }, staff: { id: 'ilsa-1', name: 'Ms Support' }, participants: [],
        messages: [
          {
            id: 'm-1', senderId: 'p-1', content: 'Said something I regret',
            createdAt: new Date('2026-08-14T09:00:00.000Z'),
            deletedAt: new Date('2026-08-14T09:02:00.000Z'),
            sender: { name: 'Sara Khan' },
            attachments: [{ fileName: 'x.pdf', fileUrl: 'https://x/x.pdf', fileType: 'application/pdf', fileSize: 4 }],
          },
        ],
      },
    ])
    prismaMock.ilsaLink.findMany.mockResolvedValue([{ userId: 'ilsa-1' }])
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await auth(request(makeApp()).get('/api/partner/oversight/ilsa-threads?hub_user_id=hu-admin&pupil_id=hp-1'))
    expect(res.status).toBe(200)
    // The row survives the read — filtering it left no trace it ever existed.
    expect(prismaMock.conversation.findMany.mock.calls[0][0].include.messages.where).toBeUndefined()
    // It says WHO and WHEN, and nothing else: no content, no fetchable file.
    expect(res.body.threads[0].messages[0]).toEqual({
      id: 'm-1',
      senderName: 'Sara Khan',
      senderRole: 'GUARDIAN',
      content: '',
      deleted: true,
      deletedAt: '2026-08-14T09:02:00.000Z',
      sentAt: '2026-08-14T09:00:00.000Z',
      attachments: [],
    })
  })
})
