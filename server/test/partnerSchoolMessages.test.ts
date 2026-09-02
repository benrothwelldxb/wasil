import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/partner/messages — the school's record of what parents were told.
 *
 * Desk shows this so nobody has to open Connect to answer "what have we already
 * sent". Two rules come from Desk's brief and are worth pinning: class ids must
 * be HUB ids, because Desk cannot resolve Connect's; and a failure must never
 * render as an empty list, because Desk's original read swallowed a 404 into []
 * and told a school with total confidence that nothing had ever been sent.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn() },
  message: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/adminNotices', () => ({ signalAdminNotice: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm-1', title: 'Swimming kit reminder', content: '<p>Bring a towel</p>',
  targetClass: 'Whole School', classId: null, yearGroupId: null, groupId: null,
  senderId: 'u-1', senderName: 'Aisha Karim',
  channel: 'FEED', department: null,
  scheduledAt: null, notifiedAt: new Date('2026-09-01T05:30:00Z'),
  createdAt: new Date('2026-09-01T05:30:00Z'),
  sender: { name: 'Aisha Karim' },
  class: null, yearGroup: null, group: null,
  _count: { acknowledgments: 12 },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
})

describe('GET /api/partner/messages', () => {
  const get = (q = '?school_id=hub-1') => auth(request(makeApp()).get(`/api/partner/messages${q}`))

  it('returns a broadcast with its acknowledgement count', async () => {
    prismaMock.message.findMany.mockResolvedValue([row()])

    const res = await get()

    expect(res.status).toBe(200)
    expect(res.body.messages[0]).toMatchObject({
      title: 'Swimming kit reminder',
      senderName: 'Aisha Karim',
      audienceLabel: 'Whole School',
      ackCount: 12,
      sentAt: '2026-09-01T05:30:00.000Z',
    })
    expect(res.body.messages[0].audience.wholeSchool).toBe(true)
  })

  // Desk speaks hubClassId everywhere and cannot resolve Connect's internal ids.
  it('reports Hub class ids, never Connect ids', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ targetClass: 'Year 4 Falcons', classId: 'connect-class-1', class: { name: 'Year 4 Falcons', hubClassId: 'hc_4f' } }),
    ])

    const res = await get()

    expect(res.body.messages[0].audience.classHubIds).toEqual(['hc_4f'])
    expect(JSON.stringify(res.body)).not.toContain('connect-class-1')
  })

  // A partner send writes one row per target, so the same broadcast is several
  // rows and must come back as one entry with its audience assembled.
  it('collapses a multi-class broadcast into one entry', async () => {
    const when = new Date('2026-09-01T05:30:00Z')
    prismaMock.message.findMany.mockResolvedValue([
      row({ id: 'm-1', targetClass: '4F', classId: 'c1', class: { name: '4F', hubClassId: 'hc_4f' }, createdAt: when, _count: { acknowledgments: 5 } }),
      row({ id: 'm-2', targetClass: '4G', classId: 'c2', class: { name: '4G', hubClassId: 'hc_4g' }, createdAt: when, _count: { acknowledgments: 7 } }),
    ])

    const res = await get()

    expect(res.body.messages).toHaveLength(1)
    expect(res.body.messages[0].audience.classHubIds).toEqual(['hc_4f', 'hc_4g'])
    expect(res.body.messages[0].audienceLabel).toBe('4F, 4G')
    // Summed, so the count describes the whole broadcast.
    expect(res.body.messages[0].ackCount).toBe(12)
  })

  it('keeps two different broadcasts apart', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ id: 'm-1', title: 'Swimming kit' }),
      row({ id: 'm-2', title: 'Parents evening' }),
    ])
    const res = await get()
    expect(res.body.messages).toHaveLength(2)
  })

  // A scheduled broadcast has reached nobody, and must not read as sent.
  it('a queued broadcast reports no sentAt', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ notifiedAt: null, scheduledAt: new Date('2026-09-10T06:00:00Z') }),
    ])

    const res = await get()

    expect(res.body.messages[0].sentAt).toBeNull()
    expect(res.body.messages[0].scheduledAt).toBe('2026-09-10T06:00:00.000Z')
  })

  it('shows an admin notice as coming from its department', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ channel: 'ADMIN_NOTICE', department: 'School Clinic' }),
    ])

    const res = await get()

    expect(res.body.messages[0]).toMatchObject({
      channel: 'ADMIN_NOTICE',
      department: 'School Clinic',
      senderName: 'School Clinic',
    })
  })

  it('is school-wide, not one sender\'s outbox', async () => {
    prismaMock.message.findMany.mockResolvedValue([])
    await get()
    const where = prismaMock.message.findMany.mock.calls[0][0].where
    expect(where).toEqual({ schoolId: 'school-1' })
    expect(where.senderId).toBeUndefined()
  })

  it('requires school_id', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/messages'))
    expect(res.status).toBe(400)
  })

  it('a school we do not host is an empty list, not an error', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await get('?school_id=nope')
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
  })

  // The rule Desk asked for, and the reason sent_broadcasts exists.
  it('a failure is a 500, never an empty list', async () => {
    prismaMock.message.findMany.mockRejectedValue(new Error('db down'))
    const res = await get()
    expect(res.status).toBe(500)
    expect(res.body.messages).toBeUndefined()
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp()).get('/api/partner/messages?school_id=hub-1')
    expect(res.status).toBe(401)
  })
})
