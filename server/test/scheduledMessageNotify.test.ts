import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Scheduled messages: told when they go live, not when they were written.
//
// A future-dated post is hidden from parents until its time, so notifying at
// creation pushed an alert about something they then could not find. Both create
// routes now hold the announcement back — and this sweep is what makes that
// silence temporary rather than permanent, which is the only reason holding back
// is an improvement at all.

const prismaMock = {
  message: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  messageAttachment: { createMany: vi.fn(), findMany: vi.fn() },
  form: { updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const notifyMock = { sendNotification: vi.fn() }
vi.mock('../src/services/notify', () => notifyMock)
vi.mock('../src/services/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
vi.mock('../src/middleware/validate', () => ({ validate: () => (_r: unknown, _s: unknown, n: () => void) => n() }))
vi.mock('../src/middleware/auth', () => {
  const pass = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'staff-1', role: 'ADMIN', schoolId: 'school-1', name: 'Ms Noor',
    }
    next()
  }
  return {
    isAuthenticated: pass, isAdmin: pass, isStaff: pass,
    canSendToTarget: pass, canMarkUrgent: pass, loadUserWithRelations: vi.fn(),
  }
})

const { publishDueScheduledMessages } = await import('../src/services/scheduledMessages')
const { default: messagesRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messagesRoutes)
  return app
}

const DUE = {
  id: 'm-1',
  title: 'Sports Day',
  content: 'Kit needed on Friday',
  targetClass: 'Whole School',
  classId: null,
  yearGroupId: null,
  groupId: null,
  schoolId: 'school-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-01T09:15:00.000Z'))
  prismaMock.message.updateMany.mockResolvedValue({ count: 1 })
  notifyMock.sendNotification.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('publishDueScheduledMessages', () => {
  it('announces a message whose time has come, to its own audience', async () => {
    prismaMock.message.findMany.mockResolvedValue([DUE])
    await publishDueScheduledMessages()

    expect(notifyMock.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MESSAGE',
        title: 'Sports Day',
        resourceType: 'MESSAGE',
        resourceId: 'm-1',
        target: expect.objectContaining({ targetClass: 'Whole School', schoolId: 'school-1' }),
      }),
    )
  })

  it('only looks at unannounced messages already due', async () => {
    prismaMock.message.findMany.mockResolvedValue([])
    await publishDueScheduledMessages()

    expect(prismaMock.message.findMany.mock.calls[0][0].where).toEqual({
      notifiedAt: null,
      scheduledAt: { not: null, lte: new Date('2026-09-01T09:15:00.000Z') },
    })
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('CLAIMS before sending, so two replicas cannot both announce it', async () => {
    prismaMock.message.findMany.mockResolvedValue([DUE])
    await publishDueScheduledMessages()

    // The claim only matches a row still unstamped — that is the whole guard.
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', notifiedAt: null },
      data: { notifiedAt: expect.any(Date) },
    })
    const claimOrder = prismaMock.message.updateMany.mock.invocationCallOrder[0]
    const sendOrder = notifyMock.sendNotification.mock.invocationCallOrder[0]
    expect(claimOrder).toBeLessThan(sendOrder)
  })

  it('says nothing when the claim is lost to another replica', async () => {
    prismaMock.message.findMany.mockResolvedValue([DUE])
    prismaMock.message.updateMany.mockResolvedValue({ count: 0 })

    await publishDueScheduledMessages()
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
  })

  it('one failure does not stop the rest of the batch', async () => {
    prismaMock.message.findMany.mockResolvedValue([DUE, { ...DUE, id: 'm-2', title: 'Trip' }])
    notifyMock.sendNotification.mockRejectedValueOnce(new Error('push down'))

    await expect(publishDueScheduledMessages()).resolves.toBeUndefined()
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('does nothing at all when nothing is due', async () => {
    prismaMock.message.findMany.mockResolvedValue([])
    await publishDueScheduledMessages()
    expect(prismaMock.message.updateMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/messages — holding the announcement back', () => {
  const post = (body: Record<string, unknown>) =>
    request(makeApp()).post('/api/messages').send({
      title: 'Sports Day', content: 'Kit needed', targetClass: 'Whole School', ...body,
    })

  beforeEach(() => {
    prismaMock.messageAttachment.findMany.mockResolvedValue([])
    // Echo the data back, plus the timestamps the response serialiser reads.
    prismaMock.message.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'm-new', createdAt: new Date(), updatedAt: new Date(), ...data,
    }))
  })

  it('says nothing about a post dated in the future, and leaves it owed', async () => {
    const res = await post({ scheduledAt: '2026-09-08T08:00:00.000Z' })
    expect(res.status).toBe(201)
    expect(notifyMock.sendNotification).not.toHaveBeenCalled()
    // notifiedAt null is the marker the sweep looks for.
    expect(prismaMock.message.create.mock.calls[0][0].data.notifiedAt).toBeNull()
  })

  it('announces an unscheduled post immediately, and records that it did', async () => {
    const res = await post({})
    expect(res.status).toBe(201)
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
    expect(prismaMock.message.create.mock.calls[0][0].data.notifiedAt).toBeInstanceOf(Date)
  })

  it('treats a past scheduledAt as live now', async () => {
    await post({ scheduledAt: '2026-08-01T08:00:00.000Z' })
    expect(notifyMock.sendNotification).toHaveBeenCalledTimes(1)
    expect(prismaMock.message.create.mock.calls[0][0].data.notifiedAt).toBeInstanceOf(Date)
  })
})
