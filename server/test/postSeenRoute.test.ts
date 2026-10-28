import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * POST /api/messages/seen — the parent app reporting posts on screen. Pinned:
 * only parents are recorded (staff previewing the feed are not a family having
 * seen it), and only posts in the parent's own school.
 */
const prismaMock = {
  message: { findMany: vi.fn() },
  messageView: { createMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (h: string) => h }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/adminNotices', () => ({ signalAdminNotice: vi.fn(), unseenNoticeCount: vi.fn() }))

let role = 'PARENT'
vi.mock('../src/middleware/auth', () => {
  const attach = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'parent-1', schoolId: 'school-1', role }
    next()
  }
  return {
    isAuthenticated: attach,
    isStaff: attach,
    isAdmin: attach,
    loadUserWithRelations: vi.fn(),
    canSendToTarget: (_r: unknown, _s: unknown, n: () => void) => n(),
    canMarkUrgent: (_r: unknown, _s: unknown, n: () => void) => n(),
  }
})

const { default: messagesRoutes } = await import('../src/routes/messages')

const app = express()
app.use(express.json())
app.use('/api/messages', messagesRoutes)

beforeEach(() => {
  vi.clearAllMocks()
  role = 'PARENT'
  prismaMock.message.findMany.mockResolvedValue([{ id: 'm-1' }])
  prismaMock.messageView.createMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/messages/seen', () => {
  it('records only posts in the parent\'s school, keeping the first sighting', async () => {
    const res = await request(app).post('/api/messages/seen').send({ ids: ['m-1', 'other-school', 'm-1'] })
    expect(res.status).toBe(200)
    expect(prismaMock.message.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['m-1', 'other-school'] }, schoolId: 'school-1',
    })
    expect(prismaMock.messageView.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'm-1', userId: 'parent-1' }],
      skipDuplicates: true,
    })
  })

  it('does not record staff', async () => {
    role = 'STAFF'
    const res = await request(app).post('/api/messages/seen').send({ ids: ['m-1'] })
    expect(res.body).toEqual({ recorded: 0 })
    expect(prismaMock.messageView.createMany).not.toHaveBeenCalled()
  })
})
