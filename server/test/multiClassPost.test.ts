import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Posting to several classes at once.
 *
 * Desk has always allowed it; Connect's own composer allowed exactly one, so a
 * head of year announcing the same thing to four classes either posted four
 * times or sent it to the whole school. The partner route fans out one row per
 * audience, and this makes the native route behave identically — a post
 * composed here and one composed in Desk should look the same in a feed.
 *
 * The two things worth holding down are the permission gate (an array must not
 * be a way around the classes a staff member is assigned to) and the single
 * announcement (several rows are one thing that happened).
 */

const prismaMock = {
  message: { create: vi.fn(), findMany: vi.fn() },
  messageAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  form: { updateMany: vi.fn() },
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  group: { findMany: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const notifyMock = { sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/adminNotices', () => ({ signalAdminNotice: vi.fn(async () => ({ sent: 0, skippedNoEmail: 0 })) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (x: string) => x }))
vi.mock('../src/services/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))

let role = 'ADMIN'
vi.mock('../src/middleware/auth', async () => {
  const actual = await vi.importActual<typeof import('../src/middleware/auth')>('../src/middleware/auth')
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'u-1', schoolId: 'school-1', role, name: 'Ms Khan' }
    next()
  }
  return {
    ...actual,
    isAuthenticated: attach,
    isStaff: attach,
    isAdmin: attach,
    loadUserWithRelations: vi.fn(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: messageRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messageRoutes)
  return app
}

const post = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/messages').send({ title: 'Sports Day', content: 'Friday', ...body })

beforeEach(() => {
  vi.clearAllMocks()
  role = 'ADMIN'
  let n = 0
  prismaMock.message.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: `m-${++n}`, createdAt: new Date('2026-09-17T09:00:00Z'), ...data }))
  prismaMock.messageAttachment.findMany.mockResolvedValue([])
  prismaMock.class.findMany.mockResolvedValue([
    { id: 'c-1', name: 'Y3 Blue' },
    { id: 'c-2', name: 'Y4 Red' },
  ])
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.group.findMany.mockResolvedValue([])
  notifyMock.resolveAudienceParentIds.mockResolvedValue(['p-1'])
})

describe('POST /api/messages — several audiences', () => {
  it('creates one row per class, each labelled with its own class', async () => {
    const res = await post({ targetClass: 'Y3 Blue', classIds: ['c-1', 'c-2'] })

    expect(res.status).toBe(201)
    expect(prismaMock.message.create).toHaveBeenCalledTimes(2)
    const created = prismaMock.message.create.mock.calls.map(c => c[0].data)
    expect(created.map(d => d.classId)).toEqual(['c-1', 'c-2'])
    // Each row carries the name of ITS class, not the one the composer happened
    // to show first — the label is what a parent reads above the post.
    expect(created.map(d => d.targetClass)).toEqual(['Y3 Blue', 'Y4 Red'])
  })

  // The point of the whole change: three rows, one buzz. A parent with children
  // in two of the selected classes is one person who was told once.
  it('announces once across the whole fan-out, not once per row', async () => {
    await post({ targetClass: 'Y3 Blue', classIds: ['c-1', 'c-2'] })

    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
    const target = notifyMock.sendNotification.mock.calls[0][0].target
    // A pre-resolved union, not a per-target audience.
    expect(target.parentUserIds).toEqual(['p-1'])
  })

  it('de-duplicates a parent who appears under two targets', async () => {
    notifyMock.resolveAudienceParentIds
      .mockResolvedValueOnce(['p-1', 'p-2'])
      .mockResolvedValueOnce(['p-2', 'p-3'])

    await post({ targetClass: 'Y3 Blue', classIds: ['c-1', 'c-2'] })

    const target = notifyMock.sendNotification.mock.calls[0][0].target
    expect([...target.parentUserIds].sort()).toEqual(['p-1', 'p-2', 'p-3'])
  })

  it('still works for a single class, unchanged', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'c-1', name: 'Y3 Blue' }])

    const res = await post({ targetClass: 'Y3 Blue', classId: 'c-1' })

    expect(res.status).toBe(201)
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.message.create.mock.calls[0][0].data.classId).toBe('c-1')
  })

  it('still works whole-school, with no audience ids at all', async () => {
    prismaMock.class.findMany.mockResolvedValue([])

    const res = await post({ targetClass: 'Whole School' })

    expect(res.status).toBe(201)
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1)
    const data = prismaMock.message.create.mock.calls[0][0].data
    expect(data.targetClass).toBe('Whole School')
    expect(data.classId).toBeNull()
  })

  // A valid id belonging to another school must not become a row. The
  // permission middleware catches a staff member reaching outside their own
  // classes; this catches an id that is not this school's at all.
  it('refuses an audience id that is not this school\'s', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'c-1', name: 'Y3 Blue' }])

    const res = await post({ targetClass: 'Y3 Blue', classIds: ['c-1', 'c-elsewhere'] })

    expect(res.status).toBe(400)
    expect(prismaMock.message.create).not.toHaveBeenCalled()
  })
})
