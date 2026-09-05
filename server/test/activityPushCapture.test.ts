import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The exact request Active's publisher put on the wire, replayed against the
 * real route.
 *
 * Captured from a live adapter against a real activity — not hand-written from
 * either side's reading of the contract. That distinction is the point: Connect's
 * ILSA sync once passed every test because the fixtures encoded the same
 * misreading of Hub's DTO as the code did (`id` for `hubUserId`, one `pupilId`
 * for `pupilIds[]`, one `name` for two), so a green suite proved only that the
 * code agreed with itself. A payload written by whoever also wrote the consumer
 * proves nothing.
 *
 * If Active changes shape, this fails — which is the job.
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

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}

// Verbatim from Active's capture. Do not tidy this: its value is that nobody
// on this side wrote it.
const CAPTURED_PATH = '/api/partner/activities/active%3Aactivity%3Acap-activity'
const CAPTURED_BODY = {
  hub_user_id: 'usr-coach',
  school_id: 'cap-school',
  externalRef: 'active:activity:cap-activity',
  source: 'active',
  version: '2026-09-05T06:37:01.602Z',
  name: 'Football',
  description: 'Games and skills for beginners.',
  category: 'Sports',
  hubTermId: 'hub-term-aut-2627',
  termName: 'Autumn Term',
  hubAcademicYearId: 'hub-ay-2627',
  academicYearName: '2026/27',
  startsOn: '2026-09-08',
  endsOn: '2026-12-11',
  meetings: [
    { dayOfWeek: 1, startTime: '15:30', endTime: '16:30' },
    { dayOfWeek: 3, startTime: '15:30', endTime: '16:30' },
  ],
  venue: 'Field',
  eligibleYearGroups: [
    { ordinal: 3, hubYearGroupId: 'hyg-3', name: 'Year 3' },
    { ordinal: 4, hubYearGroupId: 'hyg-4', name: 'Year 4' },
  ],
  eligibleGender: 'boys',
  capacity: { min: 6, max: 20 },
  inviteOnly: false,
  status: 'published',
  groupId: 'grp_football',
}

const TOKEN = 'cpk_secret'
const send = (body: Record<string, unknown> = CAPTURED_BODY) =>
  request(makeApp()).put(CAPTURED_PATH).set('Authorization', `Bearer ${TOKEN}`).send(body)
const written = () =>
  (prismaMock.ecaActivity.create.mock.calls[0]?.[0] ?? prismaMock.ecaActivity.update.mock.calls[0][0]).data

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'active', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.user.findUnique.mockResolvedValue({ id: 'staff-1', role: 'STAFF', schoolId: 'sch-1' })
  prismaMock.ecaActivity.findFirst.mockResolvedValue(null)
  prismaMock.ecaActivity.create.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivity.update.mockResolvedValue({ id: 'act-1' })
  prismaMock.ecaActivityMeeting.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.ecaActivityMeeting.createMany.mockResolvedValue({ count: 0 })
  prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'term-1' })
  prismaMock.yearGroup.findMany.mockResolvedValue([
    { id: 'yg-3', hubYearGroupId: 'hyg-3' },
    { id: 'yg-4', hubYearGroupId: 'hyg-4' },
  ])
  prismaMock.groupCategory.findMany.mockResolvedValue([
    { id: 'cat-sport', name: 'Sports' },
    { id: 'cat-eca', name: 'ECA' },
  ])
  prismaMock.group.findFirst.mockResolvedValue({ id: 'grp_football', ecaActivity: null })
})

describe("Active's captured publish", () => {
  it('is accepted cleanly, with nothing to report back', async () => {
    const res = await send()
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ id: 'act-1', created: true })
    // Every "something didn't resolve" key absent: a clean publish reads clean.
    expect(res.body).not.toHaveProperty('unknownYearGroupIds')
    expect(res.body).not.toHaveProperty('unmatchedCategoryName')
    expect(res.body).not.toHaveProperty('ignoredGroupId')
    expect(res.body).not.toHaveProperty('warning')
  })

  // The ref carries colons, so it arrives percent-encoded. If the router did
  // not decode it we would store a ref no future push could address, and the
  // next publish would create a second activity instead of editing this one.
  it('stores the decoded ref, not the percent-encoded path segment', async () => {
    await send()
    expect(written().externalRef).toBe('active:activity:cap-activity')
    expect(written().externalRef).not.toContain('%3A')
    // And the lookup used the decoded form too, or an existing activity would
    // never be found.
    expect(prismaMock.ecaActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'sch-1', externalRef: 'active:activity:cap-activity' },
      }),
    )
  })

  it('keeps both sessions of a twice-weekly club', async () => {
    await send()
    expect(prismaMock.ecaActivityMeeting.createMany).toHaveBeenCalledWith({
      data: [
        { dayOfWeek: 1, startTime: '15:30', endTime: '16:30', ecaActivityId: 'act-1' },
        { dayOfWeek: 3, startTime: '15:30', endTime: '16:30', ecaActivityId: 'act-1' },
      ],
    })
  })

  it('maps the rest of the payload as the school would read it', async () => {
    await send()
    expect(written()).toMatchObject({
      name: 'Football',
      description: 'Games and skills for beginners.',
      ecaTermId: 'term-1',
      location: 'Field',
      categoryId: 'cat-sport',        // "Sports", the school's own heading
      eligibleGender: 'BOYS_ONLY',
      eligibleYearGroupIds: ['yg-3', 'yg-4'],
      minCapacity: 6,
      maxCapacity: 20,
      activityType: 'OPEN',
      isPublished: true,
      isCancelled: false,
      source: 'active',
      groupId: 'grp_football',
      // Never from a push, whatever arrives.
      providerId: null, cost: null, paymentUrl: null,
    })
    expect(written().sourceVersion).toEqual(new Date('2026-09-05T06:37:01.602Z'))
  })

  // Withdrawal sends the whole payload rather than a tombstone: a parent told a
  // club is not running needs its name as much as its status.
  it('a withdrawal keeps the club and its details, and marks it cancelled', async () => {
    const res = await send({ ...CAPTURED_BODY, status: 'withdrawn', version: '2026-09-06T06:37:01.602Z' })
    expect(res.status).toBe(201)
    expect(written()).toMatchObject({
      name: 'Football', location: 'Field', isCancelled: true, isPublished: true, isActive: true,
    })
  })
})
