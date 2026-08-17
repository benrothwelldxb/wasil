import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Unit tests for the launch-analytics suite. Prisma is fully mocked (no DB) and
// the auth middleware is replaced so every route runs as an ADMIN of school-1.
// We assert the funnel + activation math, push adoption, feature-usage rates
// (incl. the 100% cap and parent-only acks), by-class grouping, the
// not-activated chase list, active-trend per-day dedup + WAU/MAU, and clean
// zeros for a brand-new pilot.

const prismaMock = {
  user: { findMany: vi.fn(), count: vi.fn() },
  refreshToken: { findMany: vi.fn() },
  loginCode: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  message: { count: vi.fn() },
  conversation: { count: vi.fn() },
  conversationMessage: { count: vi.fn(), findMany: vi.fn() },
  messageAcknowledgment: { count: vi.fn(), findMany: vi.fn() },
  event: { count: vi.fn() },
  eventRsvp: { count: vi.fn(), findMany: vi.fn() },
  form: { count: vi.fn() },
  formResponse: { findMany: vi.fn(), count: vi.fn() },
  attendanceRequest: { count: vi.fn(), findMany: vi.fn() },
  pulseSurvey: { count: vi.fn() },
  pulseResponse: { count: vi.fn(), findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/middleware/auth', () => {
  const setAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = {
      id: 'admin-1',
      role: 'ADMIN',
      // Unique per test so the routes' 5-minute in-memory cache (keyed by
      // schoolId) never leaks one test's result into the next.
      schoolId: (globalThis as { __testSchoolId?: string }).__testSchoolId ?? 'school-1',
    }
    next()
  }
  return { isAdmin: setAdmin, isAuthenticated: setAdmin, isStaff: setAdmin }
})

const { default: analyticsRoutes } = await import('../src/routes/analytics')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/analytics', analyticsRoutes)
  return app
}

const DAY = 24 * 60 * 60 * 1000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

// Reset to zero/empty defaults before each test; individual tests override.
let schoolCounter = 0
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as { __testSchoolId?: string }).__testSchoolId = `school-${++schoolCounter}`
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.count.mockResolvedValue(0)
  prismaMock.refreshToken.findMany.mockResolvedValue([])
  prismaMock.loginCode.findMany.mockResolvedValue([])
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.message.count.mockResolvedValue(0)
  prismaMock.conversation.count.mockResolvedValue(0)
  prismaMock.conversationMessage.count.mockResolvedValue(0)
  prismaMock.conversationMessage.findMany.mockResolvedValue([])
  prismaMock.messageAcknowledgment.count.mockResolvedValue(0)
  prismaMock.messageAcknowledgment.findMany.mockResolvedValue([])
  prismaMock.event.count.mockResolvedValue(0)
  prismaMock.eventRsvp.count.mockResolvedValue(0)
  prismaMock.eventRsvp.findMany.mockResolvedValue([])
  prismaMock.form.count.mockResolvedValue(0)
  prismaMock.formResponse.findMany.mockResolvedValue([])
  prismaMock.formResponse.count.mockResolvedValue(0)
  prismaMock.attendanceRequest.count.mockResolvedValue(0)
  prismaMock.attendanceRequest.findMany.mockResolvedValue([])
  prismaMock.pulseSurvey.count.mockResolvedValue(0)
  prismaMock.pulseResponse.count.mockResolvedValue(0)
  prismaMock.pulseResponse.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// /launch
// ---------------------------------------------------------------------------
describe('GET /api/analytics/launch', () => {
  it('computes the funnel, activationRate and pushAdoption pct', async () => {
    const now = Date.now()
    prismaMock.user.findMany.mockResolvedValue([
      // active in last 7d, invited
      { id: 'p1', email: 'p1@x.com', name: 'P1', lastSeenAt: new Date(now - 1 * DAY), welcomeSentAt: new Date() },
      // active in last 30d but not 7d, invited
      { id: 'p2', email: 'p2@x.com', name: 'P2', lastSeenAt: new Date(now - 10 * DAY), welcomeSentAt: new Date() },
      // never seen, but has a refresh token -> activated via fallback, invited
      { id: 'p3', email: 'p3@x.com', name: 'P3', lastSeenAt: null, welcomeSentAt: new Date() },
      // never seen, no history -> not activated, never invited
      { id: 'p4', email: 'p4@x.com', name: 'P4', lastSeenAt: null, welcomeSentAt: null },
    ])
    prismaMock.refreshToken.findMany.mockResolvedValue([{ userId: 'p3' }])
    prismaMock.deviceToken.findMany.mockResolvedValue([{ userId: 'p1' }, { userId: 'p2' }])
    prismaMock.message.count.mockResolvedValue(10)
    prismaMock.conversation.count.mockResolvedValue(5)
    prismaMock.eventRsvp.count.mockResolvedValue(8)
    prismaMock.form.count.mockResolvedValue(3)
    prismaMock.attendanceRequest.count.mockResolvedValue(2)
    prismaMock.pulseResponse.count.mockResolvedValue(7)

    const res = await request(makeApp()).get('/api/analytics/launch')
    expect(res.status).toBe(200)
    expect(res.body.funnel).toEqual({
      totalParents: 4,
      invited: 3,
      activated: 3, // p1, p2, p3
      active7: 1, // p1
      active30: 2, // p1, p2
    })
    expect(res.body.activationRate).toBe(75) // 3/4
    expect(res.body.pushAdoption).toEqual({ count: 2, pct: 50 })
    expect(res.body.usage).toEqual({
      messagesSent: 10,
      inboxThreads: 5,
      rsvps: 8,
      formsSent: 3,
      attendanceRequests: 2,
      pulseResponses: 7,
    })
  })

  it('returns clean zeros for a brand-new pilot with no parents', async () => {
    const res = await request(makeApp()).get('/api/analytics/launch')
    expect(res.status).toBe(200)
    expect(res.body.funnel).toEqual({ totalParents: 0, invited: 0, activated: 0, active7: 0, active30: 0 })
    expect(res.body.activationRate).toBe(0)
    expect(res.body.pushAdoption).toEqual({ count: 0, pct: 0 })
  })
})

// ---------------------------------------------------------------------------
// /feature-usage
// ---------------------------------------------------------------------------
describe('GET /api/analytics/feature-usage', () => {
  it('computes rates, caps read rate at 100%, and only counts parent acks', async () => {
    prismaMock.user.count.mockResolvedValue(3) // totalParents
    prismaMock.conversation.count
      .mockResolvedValueOnce(4) // threads
      .mockResolvedValueOnce(2) // threadsWithStaffReply
    prismaMock.conversationMessage.count.mockResolvedValue(9) // parentMessages
    prismaMock.message.count.mockResolvedValue(2) // postsSent
    prismaMock.messageAcknowledgment.count.mockResolvedValue(10) // > posts*parents (6) -> cap
    prismaMock.event.count
      .mockResolvedValueOnce(5) // eventsCount
      .mockResolvedValueOnce(2) // rsvpEventCount
    prismaMock.eventRsvp.count.mockResolvedValue(3)
    prismaMock.form.count.mockResolvedValue(2)
    prismaMock.formResponse.count.mockResolvedValue(3) // completionRate numerator
    prismaMock.pulseSurvey.count.mockResolvedValue(1)
    prismaMock.attendanceRequest.count.mockResolvedValue(4)
    prismaMock.pulseResponse.findMany.mockResolvedValue([
      { answers: { q1: 4, q2: 5 } },
      { answers: { q1: 2 } },
    ])

    const res = await request(makeApp()).get('/api/analytics/feature-usage')
    expect(res.status).toBe(200)
    expect(res.body.inbox).toEqual({
      threads: 4,
      parentMessages: 9,
      threadsWithStaffReply: 2,
      replyRate: 50, // 2/4
    })
    expect(res.body.posts).toEqual({ sent: 2, readRate: 100 }) // 10/(2*3)=166% capped
    expect(res.body.events).toEqual({ count: 5, rsvps: 3, rsvpRate: 50 }) // 3/(2*3)
    expect(res.body.forms).toEqual({ sent: 2, completionRate: 50 }) // 3/(2*3)
    expect(res.body.attendance).toEqual({ parentRequests: 4 })
    expect(res.body.pulse).toEqual({ sent: 1, responseRate: 66.7, avgScore: 3.7 }) // 2/(1*3); (4+5+2)/3

    // Read-rate numerator must be PARENT-only acks.
    const ackCall = prismaMock.messageAcknowledgment.count.mock.calls[0][0] as {
      where: { user: { role: string } }
    }
    expect(ackCall.where.user.role).toBe('PARENT')
  })

  it('returns zero rates when there is no data', async () => {
    const res = await request(makeApp()).get('/api/analytics/feature-usage')
    expect(res.status).toBe(200)
    expect(res.body.inbox.replyRate).toBe(0)
    expect(res.body.posts.readRate).toBe(0)
    expect(res.body.events.rsvpRate).toBe(0)
    expect(res.body.forms.completionRate).toBe(0)
    expect(res.body.pulse).toEqual({ sent: 0, responseRate: 0, avgScore: 0 })
  })
})

// ---------------------------------------------------------------------------
// /by-class
// ---------------------------------------------------------------------------
describe('GET /api/analytics/by-class', () => {
  it('groups parents per class and sorts by activePct', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@x.com', name: 'P1', lastSeenAt: new Date(), welcomeSentAt: null },
      { id: 'p2', email: 'p2@x.com', name: 'P2', lastSeenAt: new Date(), welcomeSentAt: null },
      { id: 'p3', email: 'p3@x.com', name: 'P3', lastSeenAt: null, welcomeSentAt: null },
    ])
    // p1, p2 activated (lastSeenAt set); p3 not.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { userId: 'p1', student: { class: { id: 'cA', name: 'Class A' } } },
      { userId: 'p2', student: { class: { id: 'cA', name: 'Class A' } } },
      { userId: 'p3', student: { class: { id: 'cB', name: 'Class B' } } },
    ])

    const res = await request(makeApp()).get('/api/analytics/by-class')
    expect(res.status).toBe(200)
    expect(res.body.classes).toEqual([
      { id: 'cA', name: 'Class A', totalParents: 2, activatedParents: 2, activePct: 100 },
      { id: 'cB', name: 'Class B', totalParents: 1, activatedParents: 0, activePct: 0 },
    ])
  })

  it('returns an empty table when there are no links', async () => {
    const res = await request(makeApp()).get('/api/analytics/by-class')
    expect(res.status).toBe(200)
    expect(res.body.classes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// /not-activated
// ---------------------------------------------------------------------------
describe('GET /api/analytics/not-activated', () => {
  it('returns only non-activated parents with class resolved', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@x.com', name: 'P1', lastSeenAt: new Date(), welcomeSentAt: null }, // activated
      { id: 'p2', email: 'p2@x.com', name: 'P2', lastSeenAt: null, welcomeSentAt: null }, // not
      { id: 'p3', email: 'p3@x.com', name: 'P3', lastSeenAt: null, welcomeSentAt: null }, // not, no link
    ])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { userId: 'p2', student: { class: { name: 'Y1 Red' } } },
    ])

    const res = await request(makeApp()).get('/api/analytics/not-activated')
    expect(res.status).toBe(200)
    expect(res.body.parents).toEqual([
      { userId: 'p2', name: 'P2', email: 'p2@x.com', className: 'Y1 Red' },
      { userId: 'p3', name: 'P3', email: 'p3@x.com', className: null },
    ])
    // p1 (activated) must be excluded.
    expect(res.body.parents.find((p: { userId: string }) => p.userId === 'p1')).toBeUndefined()

    // The link lookup must be scoped to the non-activated ids only.
    const linkCall = prismaMock.parentStudentLink.findMany.mock.calls[0][0] as {
      where: { userId: { in: string[] } }
    }
    expect(linkCall.where.userId.in.sort()).toEqual(['p2', 'p3'])
  })

  it('excludes parents activated only via login history (no lastSeenAt)', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@x.com', name: 'P1', lastSeenAt: null, welcomeSentAt: null },
      { id: 'p2', email: 'p2@x.com', name: 'P2', lastSeenAt: null, welcomeSentAt: null },
    ])
    prismaMock.refreshToken.findMany.mockResolvedValue([{ userId: 'p1' }]) // p1 has login history
    const res = await request(makeApp()).get('/api/analytics/not-activated')
    expect(res.status).toBe(200)
    expect(res.body.parents.map((p: { userId: string }) => p.userId)).toEqual(['p2'])
  })
})

// ---------------------------------------------------------------------------
// /active-trend
// ---------------------------------------------------------------------------
describe('GET /api/analytics/active-trend', () => {
  it('dedups active parents per day and rolls up WAU/MAU', async () => {
    const now = new Date()
    const today = new Date(now)
    const yesterday = new Date(now.getTime() - 1 * DAY)

    prismaMock.user.findMany.mockResolvedValue([
      { id: 'p1', email: 'p1@x.com' },
      { id: 'p2', email: 'p2@x.com' },
      { id: 'p3', email: 'p3@x.com' },
    ])
    // p1 did two actions today (a refresh + an rsvp) -> must dedup to 1.
    prismaMock.refreshToken.findMany.mockResolvedValue([{ userId: 'p1', createdAt: today }])
    prismaMock.eventRsvp.findMany.mockResolvedValue([{ userId: 'p1', createdAt: today }])
    // p2 acked today.
    prismaMock.messageAcknowledgment.findMany.mockResolvedValue([{ userId: 'p2', createdAt: today }])
    // p3 responded to a form yesterday.
    prismaMock.formResponse.findMany.mockResolvedValue([{ userId: 'p3', createdAt: yesterday }])

    const res = await request(makeApp()).get('/api/analytics/active-trend?days=3')
    expect(res.status).toBe(200)
    expect(res.body.points).toHaveLength(3)
    const todayPoint = res.body.points.find((p: { date: string }) => p.date === dayKey(today))
    const yesterdayPoint = res.body.points.find((p: { date: string }) => p.date === dayKey(yesterday))
    expect(todayPoint.activeUsers).toBe(2) // p1 (deduped) + p2
    expect(yesterdayPoint.activeUsers).toBe(1) // p3
    expect(res.body.wau).toBe(3) // p1, p2, p3 within 7d
    expect(res.body.mau).toBe(3)
  })

  it('returns a zero-filled series with no data', async () => {
    const res = await request(makeApp()).get('/api/analytics/active-trend?days=5')
    expect(res.status).toBe(200)
    expect(res.body.points).toHaveLength(5)
    expect(res.body.points.every((p: { activeUsers: number }) => p.activeUsers === 0)).toBe(true)
    expect(res.body.wau).toBe(0)
    expect(res.body.mau).toBe(0)
  })
})
