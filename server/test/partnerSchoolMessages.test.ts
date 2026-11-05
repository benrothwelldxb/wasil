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
  group: { findFirst: vi.fn() },
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

/**
 * The filters a publisher polls with: Beyond copies every post sent to a trip
 * group, from Desk, Connect or itself, into the trip's message log. Reading the
 * whole school's last 200 posts and filtering would let a busy week push a trip
 * post out of the window between polls.
 */
describe('GET /api/partner/messages — group_id and since', () => {
  const get = (q: string) => auth(request(makeApp()).get(`/api/partner/messages?school_id=hub-1${q}`))

  beforeEach(() => {
    prismaMock.group.findFirst.mockImplementation(async (args: any) =>
      args?.where?.externalRef === 'beyond:trip:t-1' || args?.where?.id === 'g-1' ? { id: 'g-1' } : null)
    prismaMock.message.findMany.mockResolvedValue([])
  })

  it('narrows to one group, addressed by id or by its externalRef', async () => {
    await get('&group_id=beyond:trip:t-1')
    expect(prismaMock.message.findMany.mock.calls[0][0].where).toEqual({ schoolId: 'school-1', groupId: 'g-1' })
    // Scoped to the school: a ref is only unique within one.
    expect(prismaMock.group.findFirst.mock.calls.every(([a]: any) => a.where.schoolId === 'school-1')).toBe(true)
  })

  it('404s a group it does not know rather than answering "nothing sent"', async () => {
    const res = await get('&group_id=nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('unknown_group')
  })

  it('reads forwards from since, oldest first, with a cursor', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ id: 'm-1', title: 'Arrived', createdAt: new Date('2026-10-20T07:00:00Z') }),
      row({ id: 'm-2', title: 'Running late', createdAt: new Date('2026-10-20T13:10:00Z') }),
    ])
    const res = await get('&group_id=g-1&since=2026-10-20T06:00:00.000Z')
    const args = prismaMock.message.findMany.mock.calls[0][0]
    expect(args.where.createdAt).toEqual({ gt: new Date('2026-10-20T06:00:00.000Z') })
    expect(args.orderBy).toEqual({ createdAt: 'asc' })
    expect(res.body.messages.map((m: any) => m.id)).toEqual(['m-1', 'm-2'])
    expect(res.body.next).toBe('2026-10-20T13:10:00.000Z')
  })

  it('hands back the same cursor when nothing new has arrived', async () => {
    const res = await get('&since=2026-10-20T06:00:00.000Z')
    expect(res.body).toEqual({ messages: [], next: '2026-10-20T06:00:00.000Z' })
  })

  it('holds back a full page\'s last entry, which may be cut part way', async () => {
    // limit=1 → take 4 rows. Four rows in two broadcasts: the second may have
    // more rows beyond the page, so it waits for the next one.
    const t1 = new Date('2026-10-20T07:00:00Z')
    const t2 = new Date('2026-10-20T08:00:00Z')
    prismaMock.message.findMany.mockResolvedValue([
      row({ id: 'm-1', title: 'A', createdAt: t1 }),
      row({ id: 'm-2', title: 'A', createdAt: t1 }),
      row({ id: 'm-3', title: 'B', createdAt: t2 }),
      row({ id: 'm-4', title: 'B', createdAt: t2 }),
    ])
    const res = await get('&since=2026-10-20T06:00:00.000Z&limit=1')
    expect(res.body.messages.map((m: any) => m.title)).toEqual(['A'])
    expect(res.body.next).toBe(t1.toISOString())
  })

  it('refuses a since that is not a time', async () => {
    const res = await get('&since=yesterday')
    expect(res.status).toBe(400)
  })

  it('keeps the newest-first order Desk reads without since', async () => {
    await get('')
    expect(prismaMock.message.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' })
    expect((await get('')).body.next).toBeUndefined()
  })

  it('says how many named pupils a pupil-addressed post reached, never which', async () => {
    prismaMock.message.findMany.mockResolvedValue([
      row({ targetClass: 'Selected pupils', _count: { acknowledgments: 0, studentTargets: 3 }, formId: 'f-1' }),
    ])
    const res = await get('')
    expect(res.body.messages[0].audience.pupilCount).toBe(3)
    expect(res.body.messages[0].formId).toBe('f-1')
  })
})
