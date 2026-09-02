import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Admin Notices — messages from a school department that sit outside the feed.
 *
 * The two properties worth pinning: a notice never appears in the feed, and the
 * email that tells a parent about it never says what it is. The second matters
 * because these come from the clinic and from accounts, and email is the least
 * private channel we have.
 */
const prismaMock = {
  message: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  messageAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  class: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
  student: { findMany: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  school: { findUnique: vi.fn() },
  form: { updateMany: vi.fn() },
  notification: { createMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (h: string) => h }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))

const sendNotification = vi.fn()
vi.mock('../src/services/notify', () => ({
  sendNotification,
  resolveAudienceParentIds: vi.fn(async () => ['parent-1', 'parent-2']),
}))

const sendAdminNoticeSignalEmail = vi.fn(async () => true)
vi.mock('../src/services/email', () => ({ sendAdminNoticeSignalEmail }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role: 'PARENT' }
    next()
  }
  return {
    isAuthenticated: attach,
    isStaff: attach,
    isAdmin: attach,
    loadUserWithRelations,
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: messagesRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messagesRoutes)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  loadUserWithRelations.mockResolvedValue({
    id: 'parent-1',
    schoolId: 'school-1',
    noticesLastSeenAt: null,
    children: [],
    studentLinks: [{ studentId: 'stu-1', student: { classId: 'c-1', firstName: 'A', lastName: 'B', class: { name: '3A' } } }],
  })
  prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'yg-1' }])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.count.mockResolvedValue(0)
  prismaMock.user.findUnique.mockResolvedValue({ schoolId: 'school-1', noticesLastSeenAt: null })
  prismaMock.user.update.mockResolvedValue({})
})

describe('the feed', () => {
  it('never includes admin notices', async () => {
    await request(makeApp()).get('/api/messages')
    expect(prismaMock.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channel: 'FEED' }) }),
    )
  })
})

describe('GET /api/messages/notices', () => {
  it('returns only notices, targeted the same way posts are', async () => {
    await request(makeApp()).get('/api/messages/notices')
    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(where.channel).toBe('ADMIN_NOTICE')
    // Same audience rules as the feed.
    expect(where.OR).toEqual(expect.arrayContaining([{ targetClass: 'Whole School' }]))
  })

  it('marks which notices arrived since the parent last looked', async () => {
    loadUserWithRelations.mockResolvedValue({
      id: 'parent-1', schoolId: 'school-1',
      noticesLastSeenAt: new Date('2026-09-01T00:00:00Z'),
      children: [], studentLinks: [],
    })
    prismaMock.message.findMany.mockResolvedValue([
      { id: 'm-1', title: 'Flu clinic', content: 'x', department: 'School Clinic', isUrgent: false, createdAt: new Date('2026-09-02T00:00:00Z'), attachments: [] },
      { id: 'm-2', title: 'Fees', content: 'y', department: 'Accounts', isUrgent: false, createdAt: new Date('2026-08-30T00:00:00Z'), attachments: [] },
    ])

    const res = await request(makeApp()).get('/api/messages/notices')

    expect(res.body.notices[0]).toMatchObject({ department: 'School Clinic', isNew: true })
    expect(res.body.notices[1]).toMatchObject({ department: 'Accounts', isNew: false })
  })

  // "No notices" and "we couldn't load your notices" must not look the same
  // when one of them is from the clinic.
  it('fails loudly rather than returning an empty list', async () => {
    prismaMock.message.findMany.mockRejectedValue(new Error('db down'))
    const res = await request(makeApp()).get('/api/messages/notices')
    expect(res.status).toBe(500)
    expect(res.body.notices).toBeUndefined()
  })
})

describe('POST /api/messages/notices/seen', () => {
  it('stamps the visit, which is what clears the bar', async () => {
    const res = await request(makeApp()).post('/api/messages/notices/seen')
    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { noticesLastSeenAt: expect.any(Date) },
    })
  })
})

describe('sending a notice', () => {
  beforeEach(() => {
    prismaMock.message.create.mockResolvedValue({
      id: 'm-new', title: 'Flu clinic Thursday', content: 'Details', department: 'School Clinic',
      channel: 'ADMIN_NOTICE', createdAt: new Date(), senderId: 'u-1', schoolId: 'school-1',
      targetClass: 'Whole School', classId: null, yearGroupId: null, groupId: null,
      isPinned: false, isUrgent: false, requiresAcknowledgment: false,
      scheduledAt: null, expiresAt: null, notifiedAt: new Date(), formId: null,
      sender: { name: 'Nurse' },
    })
    prismaMock.messageAttachment.findMany.mockResolvedValue([])
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'parent-1', email: 'a@example.com' },
      { id: 'parent-2', email: 'b@example.com' },
    ])
    prismaMock.school.findUnique.mockResolvedValue({ name: 'VHPS' })
  })

  const send = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/messages').send({
      title: 'Flu clinic Thursday', content: 'Details', targetClass: 'Whole School', ...body,
    })

  it('files it as a notice with its department', async () => {
    await send({ channel: 'ADMIN_NOTICE', department: 'School Clinic' })
    const data = prismaMock.message.create.mock.calls[0][0].data
    expect(data.channel).toBe('ADMIN_NOTICE')
    expect(data.department).toBe('School Clinic')
  })

  it('emails the audience a signal that says nothing about the notice', async () => {
    await send({ channel: 'ADMIN_NOTICE', department: 'School Clinic' })
    // Give the fire-and-forget signal a tick to run.
    await new Promise(r => setImmediate(r))

    expect(sendAdminNoticeSignalEmail).toHaveBeenCalledTimes(2)
    const call = sendAdminNoticeSignalEmail.mock.calls[0][0] as Record<string, unknown>
    expect(call.department).toBe('School Clinic')
    // The title and body are the whole reason this is a separate template.
    expect(JSON.stringify(call)).not.toContain('Flu clinic Thursday')
    expect(JSON.stringify(call)).not.toContain('Details')
  })

  it('does not push an ordinary notice', async () => {
    await send({ channel: 'ADMIN_NOTICE', department: 'Accounts' })
    await new Promise(r => setImmediate(r))
    expect(sendNotification).not.toHaveBeenCalled()
  })

  // A whole-school health message is the case that earns a push.
  it('pushes a notice the sender marked urgent', async () => {
    await send({ channel: 'ADMIN_NOTICE', department: 'School Clinic', isUrgent: true })
    await new Promise(r => setImmediate(r))
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('an ordinary post still pushes and sends no notice email', async () => {
    prismaMock.message.create.mockResolvedValue({
      ...prismaMock.message.create.mock.results[0]?.value,
      id: 'm-post', title: 'Sports day', content: 'Come along', department: null, channel: 'FEED',
      createdAt: new Date(), targetClass: 'Whole School', classId: null, yearGroupId: null,
      groupId: null, notifiedAt: new Date(), sender: { name: 'Office' }, attachments: [],
    })
    await send({ title: 'Sports day', content: 'Come along' })
    await new Promise(r => setImmediate(r))

    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendAdminNoticeSignalEmail).not.toHaveBeenCalled()
  })
})
