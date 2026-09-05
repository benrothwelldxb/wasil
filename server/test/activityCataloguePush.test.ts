import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * PUT /api/partner/activities/:externalRef — an outside system publishing the
 * school's programme into Connect.
 *
 * Connect displays these and runs none of the choice. Almost every way this
 * goes wrong is quiet: a capacity that reads as "full", a withdrawn club that
 * simply disappears, a twice-weekly club shown as once-weekly, a stale retry
 * reverting a newer edit. None of those look like errors, so they are what
 * these tests are about.
 */
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  ecaActivity: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  ecaActivityMeeting: { deleteMany: vi.fn(), createMany: vi.fn() },
  ecaTerm: { findFirst: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  groupCategory: { findMany: vi.fn() },
  group: { findFirst: vi.fn() },
  school: { findFirst: vi.fn(), findUnique: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), notifyParents: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (t: string) => t }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn(), ATTACHMENT_MIME_TYPES: [] }))

const TOKEN = 'cpk_secret'

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
const STAFF = { id: 'staff-1', role: 'STAFF', schoolId: 'sch-1', name: 'Ms Noor' }
const REF = 'active:activity:abc'
const url = `/api/partner/activities/${encodeURIComponent(REF)}`

const payload = (over: Record<string, unknown> = {}) => ({
  hub_user_id: 'hu-staff',
  source: 'active',
  version: '2026-09-05T07:41:12.482Z',
  name: 'Football',
  category: 'Sports',
  hubTermId: 'hub-term-1',
  meetings: [{ dayOfWeek: 1, startTime: '15:30', endTime: '16:30' }],
  venue: 'Field',
  eligibleYearGroups: [{ ordinal: 3, hubYearGroupId: 'hyg-3', name: 'Year 3' }],
  eligibleGender: 'mixed',
  capacity: { min: 6, max: 20 },
  inviteOnly: false,
  status: 'published',
  ...over,
})

const written = () =>
  (prismaMock.ecaActivity.create.mock.calls[0]?.[0] ?? prismaMock.ecaActivity.update.mock.calls[0][0]).data

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'active', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue(STAFF)
  prismaMock.ecaActivity.findFirst.mockResolvedValue(null)
  prismaMock.ecaActivity.create.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivity.update.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivityMeeting.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.ecaActivityMeeting.createMany.mockResolvedValue({ count: 0 })
  prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1' })
  prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-3', hubYearGroupId: 'hyg-3' }])
  prismaMock.groupCategory.findMany.mockResolvedValue([{ id: 'cat-sport', name: 'Sports' }])
  prismaMock.group.findFirst.mockResolvedValue(null)
})

describe('PUT /api/partner/activities/:externalRef', () => {
  it('403 without a resolvable staff actor', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(request(makeApp()).put(url)).send(payload({ hub_user_id: 'ghost' }))
    expect(res.status).toBe(403)
    expect(prismaMock.ecaActivity.create).not.toHaveBeenCalled()
  })

  it('creates the activity and files it against the synced term', async () => {
    const res = await auth(request(makeApp()).put(url)).send(payload())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 'act-1', created: true })
    expect(written()).toMatchObject({
      name: 'Football', ecaTermId: 'term-1', location: 'Field',
      externalRef: REF, source: 'active',
      eligibleYearGroupIds: ['yg-3'],
    })
  })

  // A clean publish should read clean — nothing to check for.
  it('reports nothing when everything resolved', async () => {
    const res = await auth(request(makeApp()).put(url)).send(payload())
    expect(res.body).not.toHaveProperty('unknownYearGroupIds')
    expect(res.body).not.toHaveProperty('unmatchedCategoryName')
    expect(res.body).not.toHaveProperty('warning')
  })

  describe('capacity', () => {
    // The mapping most likely to do real harm: stored as 0, a club with no
    // limit reads as a club with no places, and we'd tell a parent it was full.
    it('a max of 0 means no limit, not no places', async () => {
      await auth(request(makeApp()).put(url)).send(payload({ capacity: { min: 0, max: 0 } }))
      expect(written().maxCapacity).toBeNull()
      expect(written().maxCapacity).not.toBe(0)
      expect(written().minCapacity).toBeNull()
    })

    it('a real limit survives', async () => {
      await auth(request(makeApp()).put(url)).send(payload())
      expect(written()).toMatchObject({ minCapacity: 6, maxCapacity: 20 })
    })
  })

  describe('meetings', () => {
    // A club that meets twice is one club. The second session had nowhere to
    // go before, so a twice-weekly club rendered as once-weekly.
    it('keeps every session, and mirrors the first onto the legacy columns', async () => {
      await auth(request(makeApp()).put(url)).send(payload({
        meetings: [
          { dayOfWeek: 1, startTime: '15:30', endTime: '16:30' },
          { dayOfWeek: 3, startTime: '15:30', endTime: '16:30' },
        ],
      }))
      expect(prismaMock.ecaActivityMeeting.createMany).toHaveBeenCalledWith({
        data: [
          { dayOfWeek: 1, startTime: '15:30', endTime: '16:30', ecaActivityId: 'act-1' },
          { dayOfWeek: 3, startTime: '15:30', endTime: '16:30', ecaActivityId: 'act-1' },
        ],
      })
      expect(written()).toMatchObject({ dayOfWeek: 1, customStartTime: '15:30' })
    })

    // Dropping the Wednesday session must actually drop it.
    it('replaces the set wholesale rather than accumulating', async () => {
      await auth(request(makeApp()).put(url)).send(payload())
      expect(prismaMock.ecaActivityMeeting.deleteMany).toHaveBeenCalledWith({ where: { ecaActivityId: 'act-1' } })
    })

    it('a morning club is before school, an afternoon one after', async () => {
      await auth(request(makeApp()).put(url)).send(payload({
        meetings: [{ dayOfWeek: 1, startTime: '07:30', endTime: '08:15' }],
      }))
      expect(written().timeSlot).toBe('BEFORE_SCHOOL')
    })

    // Silence here would look like a club with no sessions rather than a
    // payload we couldn't read.
    it('says so when no meeting in the payload was usable', async () => {
      const res = await auth(request(makeApp()).put(url)).send(payload({
        meetings: [{ dayOfWeek: 9, startTime: 'half three', endTime: '' }],
      }))
      expect(res.body.warning).toBe('no valid meetings in payload')
      expect(prismaMock.ecaActivityMeeting.createMany).not.toHaveBeenCalled()
    })
  })

  describe('version', () => {
    // The whole point of the version: a stalled retry landing after a newer
    // publish must not revert it.
    it('ignores a push no newer than the one we accepted', async () => {
      prismaMock.ecaActivity.findFirst.mockResolvedValue({
        id: 'act-1', providerId: null, sourceVersion: new Date('2026-09-05T09:00:00.000Z'),
      })
      const res = await auth(request(makeApp()).put(url)).send(payload())
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ ignored: true, reason: 'stale_version' })
      expect(prismaMock.ecaActivity.update).not.toHaveBeenCalled()
    })

    // Equal is a no-op, so a retry recomputing to the same state costs nothing.
    it('treats an identical version as a no-op', async () => {
      prismaMock.ecaActivity.findFirst.mockResolvedValue({
        id: 'act-1', providerId: null, sourceVersion: new Date('2026-09-05T07:41:12.482Z'),
      })
      const res = await auth(request(makeApp()).put(url)).send(payload())
      expect(res.body.ignored).toBe(true)
    })

    it('applies a strictly newer push', async () => {
      prismaMock.ecaActivity.findFirst.mockResolvedValue({
        id: 'act-1', providerId: null, sourceVersion: new Date('2026-09-01T00:00:00.000Z'),
      })
      const res = await auth(request(makeApp()).put(url)).send(payload({ name: 'Football (renamed)' }))
      expect(res.status).toBe(200)
      expect(res.body.created).toBe(false)
      expect(written()).toMatchObject({ name: 'Football (renamed)' })
    })

    // Falling back to "now" would accept a stale retry over a newer publish —
    // the exact failure the version exists to prevent.
    it('refuses a push with no usable version rather than assuming now', async () => {
      const res = await auth(request(makeApp()).put(url)).send(payload({ version: 'yesterday' }))
      expect(res.status).toBe(400)
      expect(prismaMock.ecaActivity.create).not.toHaveBeenCalled()
    })
  })

  describe('withdrawal', () => {
    // A parent who saw it on Monday and finds it gone on Tuesday learns
    // nothing; one who finds it marked cancelled learns what happened.
    it('a withdrawn club stays visible and says it is cancelled', async () => {
      await auth(request(makeApp()).put(url)).send(payload({ status: 'withdrawn' }))
      expect(written()).toMatchObject({ isCancelled: true, isPublished: true, isActive: true })
    })

    it('a published club is not cancelled', async () => {
      await auth(request(makeApp()).put(url)).send(payload())
      expect(written()).toMatchObject({ isCancelled: false, isPublished: true })
    })
  })

  describe('the boundary with the provider half', () => {
    // Overwriting a club parents have paid for is the expensive mistake here,
    // so it is checked rather than assumed safe from namespacing.
    it('refuses a ref that lands on a provider-run club', async () => {
      prismaMock.ecaActivity.findFirst.mockResolvedValue({ id: 'act-9', providerId: 'prov-1', sourceVersion: null })
      const res = await auth(request(makeApp()).put(url)).send(payload())
      expect(res.status).toBe(409)
      expect(prismaMock.ecaActivity.update).not.toHaveBeenCalled()
    })

    // A school-run activity acquiring a payment link because a field arrived
    // would be a payments decision made by accident.
    it('never sets cost, payment link or provider from a push', async () => {
      await auth(request(makeApp()).put(url)).send(payload({ cost: 250, paymentUrl: 'https://pay.example', providerId: 'prov-1' }))
      expect(written()).toMatchObject({ cost: null, paymentUrl: null, providerId: null })
    })
  })

  describe('things that are reported rather than fatal', () => {
    // Hub owns term identity. A term conjured here would be a second,
    // competing record of something Hub already owns.
    it('refuses to invent a term that has not synced, and says how to fix it', async () => {
      prismaMock.ecaTerm.findFirst.mockResolvedValue(null)
      const res = await auth(request(makeApp()).put(url)).send(payload())
      expect(res.status).toBe(409)
      expect(res.body).toMatchObject({ error: 'unknown_term', hubTermId: 'hub-term-1' })
      expect(prismaMock.ecaActivity.create).not.toHaveBeenCalled()
    })

    it('publishes for the year groups it knows and names the ones it does not', async () => {
      const res = await auth(request(makeApp()).put(url)).send(payload({
        eligibleYearGroups: [
          { hubYearGroupId: 'hyg-3', name: 'Year 3' },
          { hubYearGroupId: 'hyg-x', name: 'Year 9' },
        ],
      }))
      expect(res.status).toBe(201)
      expect(res.body.unknownYearGroupIds).toEqual(['hyg-x'])
      expect(written().eligibleYearGroupIds).toEqual(['yg-3'])
    })

    // Empty means anyone may come, not nobody may.
    it('no year groups means open to all, and asks the database nothing', async () => {
      await auth(request(makeApp()).put(url)).send(payload({ eligibleYearGroups: [] }))
      expect(written().eligibleYearGroupIds).toEqual([])
      expect(prismaMock.yearGroup.findMany).not.toHaveBeenCalled()
    })

    it('a category word this school does not have leaves it uncategorised and says so', async () => {
      prismaMock.groupCategory.findMany.mockResolvedValue([{ id: 'cat-eca', name: 'ECA' }])
      const res = await auth(request(makeApp()).put(url)).send(payload({ category: 'sport' }))
      expect(res.body.unmatchedCategoryName).toBe('sport')
      expect(written().categoryId).toBeNull()
    })

    it('a group already backing another activity is ignored, not fatal', async () => {
      prismaMock.group.findFirst.mockResolvedValue({ id: 'grp-1', ecaActivity: { id: 'act-other' } })
      const res = await auth(request(makeApp()).put(url)).send(payload({ groupId: 'grp-1' }))
      expect(res.status).toBe(201)
      expect(res.body.ignoredGroupId).toBe('grp-1')
      expect(written().groupId).toBeUndefined()
    })

    it('links a free group to the activity', async () => {
      prismaMock.group.findFirst.mockResolvedValue({ id: 'grp-1', ecaActivity: null })
      await auth(request(makeApp()).put(url)).send(payload({ groupId: 'grp-1' }))
      expect(written().groupId).toBe('grp-1')
    })
  })

  describe('gender', () => {
    it('maps the three the publisher sends', async () => {
      for (const [sent, stored] of [['boys', 'BOYS_ONLY'], ['girls', 'GIRLS_ONLY'], ['mixed', 'MIXED']]) {
        vi.clearAllMocks()
        prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'active', revokedAt: null })
        prismaMock.partnerToken.update.mockResolvedValue({})
        prismaMock.user.findUnique.mockResolvedValue(STAFF)
        prismaMock.ecaActivity.findFirst.mockResolvedValue(null)
        prismaMock.ecaActivity.create.mockResolvedValue({ id: 'act-1' })
        prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1' })
        prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-3', hubYearGroupId: 'hyg-3' }])
        prismaMock.groupCategory.findMany.mockResolvedValue([{ id: 'cat-sport', name: 'Sports' }])
        await auth(request(makeApp()).put(url)).send(payload({ eligibleGender: sent }))
        expect(written().eligibleGender).toBe(stored)
      }
    })

    // Narrowing a club to one gender on a word we don't understand excludes
    // children; widening it doesn't.
    it('an unrecognised value means mixed', async () => {
      await auth(request(makeApp()).put(url)).send(payload({ eligibleGender: 'co-ed' }))
      expect(written().eligibleGender).toBe('MIXED')
    })
  })

  // The flag that says a child cannot put themselves in this.
  it('an invite-only squad is stored as one', async () => {
    await auth(request(makeApp()).put(url)).send(payload({ inviteOnly: true }))
    expect(written().activityType).toBe('INVITE_ONLY')
  })
})
