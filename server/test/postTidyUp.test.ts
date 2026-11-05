import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Keeping the Posts list tidy: a default end date, bulk archive, a safe edit,
 * and a parent's own unpin.
 *
 * The school had hundreds of posts and "Show until" seemed to do nothing. Two
 * real causes sat under that: the field was optional and almost never filled,
 * and the one-click Unpin saved the post with every unsent field cleared —
 * end date included. These tests hold both shut, and hold the archive to
 * "hidden from parents, never deleted".
 */

const prismaMock = {
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  messageAttachment: { createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  messagePinDismissal: { upsert: vi.fn(), deleteMany: vi.fn() },
  form: { updateMany: vi.fn() },
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  group: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const notifyMock = { sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/adminNotices', () => ({ signalAdminNotice: vi.fn(async () => ({ sent: 0, skippedNoEmail: 0 })), unseenNoticeCount: vi.fn(async () => 0) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (x: string) => x }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/services/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))

let user: Record<string, unknown> = {}
vi.mock('../src/middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../src/middleware/auth')>('../src/middleware/auth')
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = user
    next()
  }
  return {
    ...actual,
    isAuthenticated: attach,
    isStaff: attach,
    isAdmin: attach,
    loadUserWithRelations: vi.fn(async () => ({
      ...user, preferredLanguage: 'en', children: [], studentLinks: [{ studentId: 's-1', student: { classId: 'c-1' } }],
    })),
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { defaultPostExpiry } = await import('../src/services/dateTime')
const { default: messageRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messageRoutes)
  return app
}

const ADMIN = { id: 'u-1', schoolId: 'school-1', role: 'ADMIN', name: 'Ms Khan' }
const PARENT = { id: 'p-1', schoolId: 'school-1', role: 'PARENT', name: 'A Parent' }

const EXISTING = {
  id: 'm-1', schoolId: 'school-1', title: 'Trip', content: 'Bring a hat', targetClass: 'Y3 Blue',
  classId: 'c-1', yearGroupId: null, groupId: null,
  actionType: 'consent', actionLabel: 'Sign', actionDueDate: new Date('2026-11-20T00:00:00Z'), actionAmount: null,
  isPinned: true, isUrgent: false, requiresAcknowledgment: true,
  scheduledAt: null, expiresAt: new Date('2026-11-21T20:00:00Z'), formId: 'f-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  user = ADMIN
  prismaMock.school.findUnique.mockResolvedValue({ timezone: 'Asia/Dubai' })
  prismaMock.message.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'm-new', createdAt: new Date(), ...data }))
  prismaMock.message.findFirst.mockResolvedValue(EXISTING)
  prismaMock.message.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      ...EXISTING, ...data, sender: { id: 'u-1', name: 'Ms Khan' }, attachments: [], _count: { acknowledgments: 0 },
      createdAt: new Date('2026-11-01T09:00:00Z'), updatedAt: new Date(),
    }))
  prismaMock.messageAttachment.findMany.mockResolvedValue([])
  prismaMock.class.findMany.mockResolvedValue([{ id: 'c-1', name: 'Y3 Blue', yearGroupId: 'yg-1' }])
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.group.findMany.mockResolvedValue([])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  notifyMock.resolveAudienceParentIds.mockResolvedValue([])
})

describe('the default end date', () => {
  // Dubai is UTC+4 with no DST, so "end of the 19th" is 20:00Z on the 19th.
  it('is the end of the day two weeks after going live, at the school', () => {
    const live = new Date('2026-11-05T06:00:00Z') // 10:00 in Dubai
    expect(defaultPostExpiry(live, 'Asia/Dubai').toISOString()).toBe('2026-11-19T20:00:00.000Z')
  })

  // Late evening UTC is already tomorrow in Dubai; the count starts from the
  // school's date, not the server's.
  it('counts from the date at the school, not in UTC', () => {
    const live = new Date('2026-11-05T22:00:00Z') // 02:00 on the 6th in Dubai
    expect(defaultPostExpiry(live, 'Asia/Dubai').toISOString()).toBe('2026-11-20T20:00:00.000Z')
  })

  it('never hides a post before the day its action is due', () => {
    const live = new Date('2026-11-05T06:00:00Z')
    const due = new Date('2026-12-10T08:00:00Z')
    expect(defaultPostExpiry(live, 'Asia/Dubai', due).toISOString()).toBe('2026-12-10T20:00:00.000Z')
  })

  it('is applied when a post is created with no date', async () => {
    const res = await request(makeApp()).post('/api/messages')
      .send({ title: 'Book fair', content: 'Friday', targetClass: 'Whole School' })
    expect(res.status).toBe(201)
    const stored = prismaMock.message.create.mock.calls[0][0].data.expiresAt as Date
    const days = (stored.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(15.1)
  })

  it('is not applied when the sender chose a date', async () => {
    await request(makeApp()).post('/api/messages')
      .send({ title: 'Book fair', content: 'Friday', targetClass: 'Whole School', expiresAt: '2027-01-31' })
    const stored = prismaMock.message.create.mock.calls[0][0].data.expiresAt as Date
    expect(stored.toISOString()).toBe('2027-01-31T20:00:00.000Z')
  })
})

describe('PUT /api/messages/:id leaves alone what it is not sent', () => {
  // Exactly what the one-click Unpin sends.
  it('unpinning keeps the end date, the action, the class and the form', async () => {
    const res = await request(makeApp()).put('/api/messages/m-1')
      .send({ title: 'Trip', content: 'Bring a hat', targetClass: 'Y3 Blue', isPinned: false })
    expect(res.status).toBe(200)

    const data = prismaMock.message.update.mock.calls[0][0].data
    expect(data.isPinned).toBe(false)
    expect(data.expiresAt).toEqual(EXISTING.expiresAt)
    expect(data.classId).toBe('c-1')
    expect(data.actionType).toBe('consent')
    expect(data.actionDueDate).toEqual(EXISTING.actionDueDate)
    expect(data.formId).toBe('f-1')
  })

  it('clears a field sent as an empty string', async () => {
    await request(makeApp()).put('/api/messages/m-1')
      .send({ title: 'Trip', content: 'Bring a hat', targetClass: 'Whole School', classId: '', expiresAt: '', actionType: '' })
    const data = prismaMock.message.update.mock.calls[0][0].data
    expect(data.classId).toBeNull()
    expect(data.expiresAt).toBeNull()
    expect(data.actionType).toBeNull()
  })
})

describe('POST /api/messages/bulk-archive', () => {
  it('archives only this school’s posts that are not archived yet, and says how many', async () => {
    prismaMock.message.updateMany.mockResolvedValue({ count: 2 })
    const res = await request(makeApp()).post('/api/messages/bulk-archive')
      .send({ ids: ['m-1', 'm-2', 'm-2'], archived: true })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ changed: 2 })
    const call = prismaMock.message.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: { in: ['m-1', 'm-2'] }, schoolId: 'school-1', archivedAt: null })
    expect(call.data.archivedAt).toBeInstanceOf(Date)
    expect(call.data.archivedById).toBe('u-1')
    expect(prismaMock.auditLog.create).toHaveBeenCalled()
  })

  // Never a delete: the same rows come back untouched.
  it('restores archived posts', async () => {
    prismaMock.message.updateMany.mockResolvedValue({ count: 1 })
    await request(makeApp()).post('/api/messages/bulk-archive').send({ ids: ['m-1'], archived: false })
    const call = prismaMock.message.updateMany.mock.calls[0][0]
    expect(call.where.archivedAt).toEqual({ not: null })
    expect(call.data).toEqual({ archivedAt: null, archivedById: null })
  })
})

describe('what a parent sees', () => {
  const row = (over: Record<string, unknown>) => ({
    ...EXISTING, sender: { id: 'u-1', name: 'Office' }, form: null, attachments: [],
    acknowledgments: [], views: [], pinDismissals: [], _count: { acknowledgments: 0 },
    createdAt: new Date('2026-11-01T09:00:00Z'), ...over,
  })

  it('never includes an archived post', async () => {
    user = PARENT
    prismaMock.message.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/messages')
    expect(prismaMock.message.findMany.mock.calls[0][0].where.AND).toContainEqual({ archivedAt: null })
  })

  it('shows a post they unpinned as unpinned, below the ones still pinned', async () => {
    user = PARENT
    prismaMock.message.findMany.mockResolvedValue([
      row({ id: 'm-mine', isPinned: true, pinDismissals: [{ userId: 'p-1' }], createdAt: new Date('2026-11-03T09:00:00Z') }),
      row({ id: 'm-pinned', isPinned: true, createdAt: new Date('2026-11-01T09:00:00Z') }),
    ])
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body.map((m: { id: string; isPinned: boolean }) => [m.id, m.isPinned])).toEqual([
      ['m-pinned', true],
      ['m-mine', false],
    ])
  })

  it('lets a parent unpin a pinned post for themselves', async () => {
    user = PARENT
    prismaMock.message.findFirst.mockResolvedValue({ id: 'm-1' })
    const res = await request(makeApp()).post('/api/messages/m-1/unpin')
    expect(res.status).toBe(200)
    expect(prismaMock.message.findFirst.mock.calls[0][0].where).toEqual({ id: 'm-1', schoolId: 'school-1', isPinned: true })
    expect(prismaMock.messagePinDismissal.upsert).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: 'm-1', userId: 'p-1' } },
      update: {},
      create: { messageId: 'm-1', userId: 'p-1' },
    })
  })

  it('refuses to "unpin" a post the school never pinned', async () => {
    user = PARENT
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/messages/m-1/unpin')
    expect(res.status).toBe(404)
    expect(prismaMock.messagePinDismissal.upsert).not.toHaveBeenCalled()
  })
})
