import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * GET /api/partner/weekly-messages — the principal's weekly update, for Desk's
 * "Sent to parents" view.
 *
 * Desk already merges Connect's admin posts into that view. It reads
 * /api/partner/messages, which queries the Message model, and the weekly
 * update is WeeklyMessage — a different model. So it never came through, and
 * nothing said it was missing.
 *
 * Two things here are worth more than the happy path: a scheduled update must
 * not look like something parents have seen, and the heart count must arrive
 * without the identities behind it.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  school: { findFirst: vi.fn() },
  weeklyMessage: { findMany: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), resolveAudienceParentIds: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

const TOKEN = 'cpk_secret'
const get = (q: string) =>
  request(makeApp()).get(`/api/partner/weekly-messages${q}`).set('Authorization', `Bearer ${TOKEN}`)

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000)
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000)
const CREATED = new Date('2026-09-14T08:00:00Z')

const row = (over: Record<string, unknown> = {}) => ({
  id: 'wm-1',
  title: "Principal's update",
  content: 'Sports Day is **Friday**. Message [@Rob Davies](/inbox/new?staff=staff-1).',
  weekOf: new Date('2026-09-14T00:00:00Z'),
  imageUrl: null,
  scheduledAt: null,
  createdAt: CREATED,
  _count: { hearts: 7 },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', weeklyUpdatesEnabled: true })
  prismaMock.weeklyMessage.findMany.mockResolvedValue([row()])
})

describe('GET /api/partner/weekly-messages', () => {
  it('returns the update as written, markdown and mentions intact', async () => {
    const res = await get('?school_id=hub-1')

    expect(res.status).toBe(200)
    // Not translated and not rendered — Desk's reader is the staff member who
    // wrote it, and Desk does its own rendering.
    expect(res.body.messages[0].content).toContain('**Friday**')
    expect(res.body.messages[0].content).toContain('[@Rob Davies](/inbox/new?staff=staff-1)')
  })

  it('carries the heart COUNT and never who gave them', async () => {
    const res = await get('?school_id=hub-1')

    expect(res.body.messages[0].hearts).toBe(7)
    // No userId, no names, nothing that identifies a parent.
    expect(JSON.stringify(res.body)).not.toContain('userId')
    const select = prismaMock.weeklyMessage.findMany.mock.calls[0][0].select
    expect(select.hearts).toBeUndefined()
    expect(select._count).toEqual({ select: { hearts: true } })
  })

  // An update drafted for Monday must not read to staff as something parents
  // have already been told.
  it('reports a future-scheduled update as NOT published', async () => {
    prismaMock.weeklyMessage.findMany.mockResolvedValue([row({ scheduledAt: FUTURE })])

    const res = await get('?school_id=hub-1')

    expect(res.body.messages[0].publishedAt).toBeNull()
    expect(res.body.messages[0].scheduledAt).toBe(FUTURE.toISOString())
  })

  it('reports a past-scheduled update as published when it was scheduled', async () => {
    prismaMock.weeklyMessage.findMany.mockResolvedValue([row({ scheduledAt: PAST })])

    const res = await get('?school_id=hub-1')

    expect(res.body.messages[0].publishedAt).toBe(PAST.toISOString())
  })

  it('treats an unscheduled update as published when it was created', async () => {
    const res = await get('?school_id=hub-1')

    expect(res.body.messages[0].publishedAt).toBe(CREATED.toISOString())
  })

  // A school that has not turned the module on has not told parents anything
  // through it, so there is nothing for staff to be shown.
  // An empty list means two different things and a reader cannot tell them
  // apart: a school that has not adopted this, and a school that has and has
  // written nothing this week. The first should show no section at all; the
  // second is a real absence somebody might chase. Guessing wrong implies a
  // principal is failing to write something he never undertook to.
  it('says the feature is off rather than just returning nothing', async () => {
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', weeklyUpdatesEnabled: false })

    const res = await get('?school_id=hub-1')

    expect(res.body).toEqual({ enabled: false, messages: [] })
    expect(prismaMock.weeklyMessage.findMany).not.toHaveBeenCalled()
  })

  it('distinguishes "on, nothing written" from "off"', async () => {
    prismaMock.weeklyMessage.findMany.mockResolvedValue([])

    const res = await get('?school_id=hub-1')

    expect(res.body).toEqual({ enabled: true, messages: [] })
  })

  it('accepts a Hub school id or a Connect one, and treats unknown as empty', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)

    const res = await get('?school_id=nope')

    expect(res.status).toBe(200)
    // A school we do not host is not "enabled with nothing written".
    expect(res.body).toEqual({ enabled: false, messages: [] })
    expect(prismaMock.school.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ hubSchoolId: 'nope' }, { id: 'nope' }] } })
    )
  })

  it('requires school_id rather than listing every school it hosts', async () => {
    const res = await get('')

    expect(res.status).toBe(400)
    expect(prismaMock.weeklyMessage.findMany).not.toHaveBeenCalled()
  })

  it('caps the limit, so one call cannot ask for the whole history', async () => {
    await get('?school_id=hub-1&limit=5000')
    expect(prismaMock.weeklyMessage.findMany.mock.calls[0][0].take).toBe(50)

    vi.clearAllMocks()
    prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
    prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1', weeklyUpdatesEnabled: true })
    prismaMock.weeklyMessage.findMany.mockResolvedValue([])
    await get('?school_id=hub-1')
    expect(prismaMock.weeklyMessage.findMany.mock.calls[0][0].take).toBe(20)
  })

  it('refuses an unauthenticated caller', async () => {
    const res = await request(makeApp()).get('/api/partner/weekly-messages?school_id=hub-1')

    expect(res.status).toBeGreaterThanOrEqual(401)
    expect(prismaMock.weeklyMessage.findMany).not.toHaveBeenCalled()
  })
})
