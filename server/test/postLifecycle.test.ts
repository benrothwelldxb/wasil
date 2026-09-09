import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The dashboard window, and the archive behind it.
 *
 * The dashboard was the entire archive — every post the school had ever
 * written, downloaded in full on every load. It now shows what is current;
 * older posts live on the Posts page and nothing is deleted.
 *
 * The exemptions are the part worth pinning. A lifecycle that hides an unsigned
 * consent form because it is five weeks old has done real harm in the name of
 * tidiness.
 */
const prismaMock = {
  message: { findMany: vi.fn() },
  class: { findMany: vi.fn() },
  studentGroupLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), notifyParents: vi.fn() }))
vi.mock('../src/services/translation', () => ({ translateTexts: vi.fn(async (t: string[]) => t) }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))
vi.mock('../src/services/adminNotices', () => ({ signalAdminNotice: vi.fn(), unseenNoticeCount: vi.fn(async () => 0) }))
vi.mock('../src/middleware/validate', () => ({
  validate: () => (_r: unknown, _s: unknown, n: () => void) => n(),
}))
vi.mock('../src/middleware/auth', () => {
  const asParent = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'p-1', schoolId: 'sch-1', role: 'PARENT' }
    next()
  }
  const pass = (_r: unknown, _s: unknown, n: () => void) => n()
  return {
    isAuthenticated: asParent, isAdmin: asParent, isStaff: asParent,
    canSendToTarget: pass, canMarkUrgent: pass,
    loadUserWithRelations: vi.fn(async () => ({
      id: 'p-1', schoolId: 'sch-1', role: 'PARENT', preferredLanguage: 'en',
      children: [], studentLinks: [{ studentId: 's-1', student: { classId: 'c-1' } }],
    })),
  }
})

const { default: messageRoutes } = await import('../src/routes/messages')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/messages', messageRoutes)
  return app
}

const post = (over: Record<string, unknown> = {}) => ({
  id: 'm-1', title: 'Book fair', content: 'On Friday', targetClass: 'Whole School',
  classId: null, yearGroupId: null, groupId: null, schoolId: 'sch-1',
  senderId: 'u-1', sender: { id: 'u-1', name: 'Office' },
  actionType: null, actionLabel: null, actionDueDate: null, actionAmount: null,
  isPinned: false, isUrgent: false, requiresAcknowledgment: false,
  expiresAt: null, formId: null, form: null, attachments: [],
  acknowledgments: [], _count: { acknowledgments: 0 },
  createdAt: new Date('2026-09-01T09:00:00.000Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.class.findMany.mockResolvedValue([{ yearGroupId: 'yg-1' }])
  prismaMock.studentGroupLink.findMany.mockResolvedValue([])
  prismaMock.message.findMany.mockResolvedValue([post()])
})

/** The AND clause the dashboard applies on top of audience + liveness. */
const windowClause = () => {
  const where = prismaMock.message.findMany.mock.calls[0][0].where
  return where.AND[where.AND.length - 1].OR
}

describe('the dashboard shows what is current', () => {
  it('filters to a recent window rather than everything ever posted', async () => {
    await request(makeApp()).get('/api/messages')
    const recent = windowClause().find((c: Record<string, unknown>) => 'createdAt' in c)
    expect(recent.createdAt.gte).toBeInstanceOf(Date)
    // Thirty days back, give or take the moment the test runs.
    const days = (Date.now() - recent.createdAt.gte.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })

  it('caps how many it will return', async () => {
    await request(makeApp()).get('/api/messages')
    expect(prismaMock.message.findMany.mock.calls[0][0].take).toBe(50)
  })

  // Pinning keeps a post up for longer, but not forever: nobody unpins, so an
  // unbounded exemption meant last September's pin was still on the dashboard
  // this September, rebuilding the wall the window was meant to clear.
  it('keeps pinned posts longer than ordinary ones, and not indefinitely', async () => {
    await request(makeApp()).get('/api/messages')
    const pinned = windowClause().find(
      (c: { AND?: Array<Record<string, unknown>> }) => c.AND?.[0] && 'isPinned' in c.AND[0],
    )
    expect(pinned.AND[0]).toEqual({ isPinned: true })

    const pinnedFloor = pinned.AND[1].createdAt.gte
    expect(pinnedFloor).toBeInstanceOf(Date)
    const days = (Date.now() - pinnedFloor.getTime()) / 86_400_000
    expect(days).toBeGreaterThan(89.9)
    expect(days).toBeLessThan(90.1)
  })

  // The exemption that must stay unbounded is the other one.
  it('never exempts a pinned post from the window entirely', async () => {
    await request(makeApp()).get('/api/messages')
    expect(windowClause()).not.toContainEqual({ isPinned: true })
  })

  // The safety catch: a post still ASKING something of this parent does not age
  // out. Tidying away an unsigned consent form is the tidy-up doing harm.
  it('exempts a post still awaiting THIS parent’s acknowledgement', async () => {
    await request(makeApp()).get('/api/messages')
    expect(windowClause()).toContainEqual({
      AND: [{ requiresAcknowledgment: true }, { acknowledgments: { none: { userId: 'p-1' } } }],
    })
  })

  // Once they have acknowledged it, it is finished and may age out like
  // anything else.
  it('does not exempt one this parent has already acknowledged', async () => {
    await request(makeApp()).get('/api/messages')
    const ackClause = windowClause().find(
      (c: { AND?: Array<Record<string, unknown>> }) => c.AND?.[0] && 'requiresAcknowledgment' in c.AND[0],
    )
    expect(ackClause.AND[1].acknowledgments.none.userId).toBe('p-1')
  })

  it('still keeps notices out of the feed', async () => {
    await request(makeApp()).get('/api/messages')
    expect(prismaMock.message.findMany.mock.calls[0][0].where.channel).toBe('FEED')
  })
})

describe('the archive holds the rest', () => {
  it('applies no date window at all', async () => {
    await request(makeApp()).get('/api/messages/archive')
    const where = prismaMock.message.findMany.mock.calls[0][0].where
    const flat = JSON.stringify(where)
    expect(flat).not.toContain('gte')
    expect(where.channel).toBe('FEED')
  })

  // Strictly chronological: this is a record of what was said and when, and
  // reordering by importance would make the months read wrongly.
  it('orders by date, not by pinned', async () => {
    await request(makeApp()).get('/api/messages/archive')
    const orderBy = prismaMock.message.findMany.mock.calls[0][0].orderBy
    expect(orderBy[0]).toEqual({ createdAt: 'desc' })
    expect(JSON.stringify(orderBy)).not.toContain('isPinned')
  })

  it('reports no next page when the results fit', async () => {
    prismaMock.message.findMany.mockResolvedValue([post()])
    const res = await request(makeApp()).get('/api/messages/archive?limit=20')
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(1)
    expect(res.body.nextCursor).toBeNull()
  })

  // One extra row is fetched purely to answer "is there more" — and must not
  // be sent, or every page would show a post twice.
  it('fetches one more than asked, returns only what was asked, and hands back a cursor', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c' }),
    ])
    const res = await request(makeApp()).get('/api/messages/archive?limit=2')

    expect(prismaMock.message.findMany.mock.calls[0][0].take).toBe(3)
    expect(res.body.messages.map((m: { id: string }) => m.id)).toEqual(['a', 'b'])
    expect(res.body.nextCursor).toBe('b')
  })

  it('continues from a cursor, skipping the row it names', async () => {
    await request(makeApp()).get('/api/messages/archive?cursor=b')
    const arg = prismaMock.message.findMany.mock.calls[0][0]
    expect(arg.cursor).toEqual({ id: 'b' })
    expect(arg.skip).toBe(1)
  })

  it('clamps an absurd limit rather than reading the whole table', async () => {
    await request(makeApp()).get('/api/messages/archive?limit=5000')
    expect(prismaMock.message.findMany.mock.calls[0][0].take).toBe(51)
  })

  // `expiresAt` is the school saying "stop showing this". Honouring it in one
  // place and not the other would make the rule mean two things.
  it('still hides expired posts', async () => {
    await request(makeApp()).get('/api/messages/archive')
    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(JSON.stringify(where.AND)).toContain('expiresAt')
  })
})
