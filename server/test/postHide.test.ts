import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A parent hiding a post from their own feed.
 *
 * Parents asked to swipe away posts that are not for them. Two things must
 * hold: a hide never buries something the school is waiting on (a form, an
 * acknowledgement, a payment, an urgent notice), and a hidden post can always
 * be found again on the Posts page.
 */

const prismaMock = {
  message: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  messageAttachment: { createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  messagePinDismissal: { upsert: vi.fn(), deleteMany: vi.fn() },
  messageHide: { upsert: vi.fn(), deleteMany: vi.fn() },
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

const { default: messageRoutes, stillAsksOfParent } = await import('../src/routes/messages')

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


const NOW = new Date('2026-11-10T09:00:00Z')

// A post that asks nothing of anyone: read it and move on.
const PLAIN = {
  ...EXISTING, id: 'm-1', isPinned: false, isUrgent: false, requiresAcknowledgment: false,
  actionType: null, actionLabel: null, actionDueDate: null, formId: null, form: null,
  channel: 'FEED', sender: { id: 'u-1', name: 'Office' }, attachments: [],
  acknowledgments: [], views: [], pinDismissals: [], hides: [], _count: { acknowledgments: 0 },
  createdAt: new Date('2026-11-01T09:00:00Z'),
}
const OPEN_FORM = { id: 'f-1', status: 'ACTIVE', expiresAt: null, perChild: false, responses: [], fields: [], createdAt: NOW, updatedAt: NOW, title: 'Trip', description: null }

describe('what may be hidden', () => {
  const asks = (over: Record<string, unknown>, answered = false) =>
    stillAsksOfParent({ ...PLAIN, ...over } as never, answered, NOW)

  it('lets a parent hide a post that asks nothing of them', () => {
    expect(asks({})).toBe(false)
  })

  it('keeps an urgent post', () => {
    expect(asks({ isUrgent: true })).toBe(true)
  })

  it('keeps a post waiting on their acknowledgement, and lets it go once given', () => {
    expect(asks({ requiresAcknowledgment: true })).toBe(true)
    expect(asks({ requiresAcknowledgment: true, acknowledgments: [{ userId: 'p-1' }] })).toBe(false)
  })

  it('keeps a post whose action is not yet due, and lets it go after', () => {
    expect(asks({ actionDueDate: new Date('2026-11-12T00:00:00Z') })).toBe(true)
    expect(asks({ actionDueDate: new Date('2026-11-08T00:00:00Z') })).toBe(false)
  })

  it('keeps an open form until it is answered, closed, or past its deadline', () => {
    expect(asks({ form: OPEN_FORM })).toBe(true)
    expect(asks({ form: OPEN_FORM }, true)).toBe(false)
    expect(asks({ form: { ...OPEN_FORM, status: 'CLOSED' } })).toBe(false)
    expect(asks({ form: { ...OPEN_FORM, expiresAt: new Date('2026-11-09T00:00:00Z') } })).toBe(false)
  })
})

describe('hiding a post', () => {
  beforeEach(() => { user = PARENT })

  it('hides a post for this parent only', async () => {
    prismaMock.message.findFirst.mockResolvedValue(PLAIN)
    const res = await request(makeApp()).post('/api/messages/m-1/hide')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hidden: true })
    expect(prismaMock.message.findFirst.mock.calls[0][0].where).toEqual({ id: 'm-1', schoolId: 'school-1', channel: 'FEED' })
    expect(prismaMock.messageHide.upsert).toHaveBeenCalledWith({
      where: { messageId_userId: { messageId: 'm-1', userId: 'p-1' } },
      update: {},
      create: { messageId: 'm-1', userId: 'p-1' },
    })
  })

  it('refuses to hide a post still waiting on the parent', async () => {
    prismaMock.message.findFirst.mockResolvedValue({ ...PLAIN, requiresAcknowledgment: true })
    const res = await request(makeApp()).post('/api/messages/m-1/hide')
    expect(res.status).toBe(409)
    expect(prismaMock.messageHide.upsert).not.toHaveBeenCalled()
  })

  it('refuses to hide a post that is not in their school, or not in the feed', async () => {
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await request(makeApp()).post('/api/messages/m-1/hide')
    expect(res.status).toBe(404)
    expect(prismaMock.messageHide.upsert).not.toHaveBeenCalled()
  })

  it('puts a hidden post back', async () => {
    const res = await request(makeApp()).delete('/api/messages/m-1/hide')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hidden: false })
    expect(prismaMock.messageHide.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'm-1', userId: 'p-1' } })
  })
})

describe('where hidden posts go', () => {
  beforeEach(() => { user = PARENT })

  it('leaves them out of the feed, unless they start asking something again', async () => {
    prismaMock.message.findFirst.mockResolvedValue(null)
    prismaMock.message.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/messages')
    const and = prismaMock.message.findMany.mock.calls[0][0].where.AND
    const clause = and.find((c: { OR?: unknown[] }) => c.OR?.some(o => JSON.stringify(o).includes('hides')))
    expect(clause.OR[0]).toEqual({ hides: { none: { userId: 'p-1' } } })
    expect(clause.OR).toContainEqual({ isUrgent: true })
    expect(clause.OR).toContainEqual({ AND: [{ requiresAcknowledgment: true }, { acknowledgments: { none: { userId: 'p-1' } } }] })
  })

  it('keeps them on the Posts page, marked hidden', async () => {
    prismaMock.message.findMany.mockResolvedValue([{ ...PLAIN, hides: [{ userId: 'p-1' }] }])
    const res = await request(makeApp()).get('/api/messages/archive')
    expect(prismaMock.message.findMany.mock.calls[0][0].where.AND).not.toContainEqual({ hides: { some: { userId: 'p-1' } } })
    expect(res.body.messages[0]).toMatchObject({ id: 'm-1', hidden: true, canHide: true })
  })

  it('lists only the hidden ones when asked', async () => {
    prismaMock.message.findMany.mockResolvedValue([])
    await request(makeApp()).get('/api/messages/archive?hidden=only')
    expect(prismaMock.message.findMany.mock.calls[0][0].where.AND).toContainEqual({ hides: { some: { userId: 'p-1' } } })
  })

  it('tells the app which posts it may offer to hide', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      { ...PLAIN, id: 'm-plain' },
      { ...PLAIN, id: 'm-urgent', isUrgent: true },
    ])
    const res = await request(makeApp()).get('/api/messages')
    expect(res.body.map((m: { id: string; canHide: boolean; hidden: boolean }) => [m.id, m.canHide, m.hidden])).toEqual([
      ['m-plain', true, false],
      ['m-urgent', false, false],
    ])
  })
})
