import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * A teacher who has left cannot read parent conversations through Desk.
 *
 * Desk's inbox is served by Connect's partner API, and actor resolution
 * authorises on "is this hubUserId in Hub's staff list". Hub deliberately keeps
 * returning leavers in that list for ever — an app holding last term's duty
 * roster has to resolve the id to a name, and that is the right call. But it
 * meant a departed teacher still resolved as a LIVE ACTOR here and could read
 * parent correspondence through Desk indefinitely.
 *
 * #116 and #118 stopped a leaver being OFFERED in pickers. Nothing stopped one
 * ACTING. This is that hole.
 *
 * The refusal carries `actor_has_left` rather than the generic 403 because
 * Desk's copy for an unrecognised actor tells the reader to ask an admin to run
 * a Hub sync. For a leaver that is untrue in an expensive direction: they chase
 * the office, and the office goes looking for a bug in Hub. The code lets Desk
 * say the true thing — access ended when you left, and nothing restores it.
 */

const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  school: { findFirst: vi.fn(), findMany: vi.fn() },
  conversation: { findMany: vi.fn() },
  ilsaLink: { findFirst: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn(), sendStaffNotification: vi.fn() }))
vi.mock('../src/services/htmlSanitizer', () => ({ sanitizeRichText: (s: string) => s }))
vi.mock('../src/services/storage', () => ({ uploadFile: vi.fn(), generateKey: vi.fn() }))
vi.mock('../src/services/uploadValidation', () => ({ checkUpload: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer cpk_secret')

const PAST = new Date('2026-07-10T00:00:00.000Z')
const FUTURE = new Date('2027-07-15T00:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.conversation.findMany.mockResolvedValue([])
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.school.findFirst.mockResolvedValue({ id: 'sch-1' })
})

describe('a departed actor is refused, with a code Desk can read', () => {
  it('refuses a read with actor_has_left', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone Teacher', leftAt: PAST,
    })

    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone'))

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'actor_has_left' })
    // Refused before the route ran — no thread query at all.
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
  })

  it('refuses a write, taking hub_user_id from the body', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone Teacher', leftAt: PAST,
    })

    const res = await auth(request(makeApp()).post('/api/partner/messages'))
      .send({ hub_user_id: 'hu-gone', title: 'T', content: 'C', audience: { wholeSchool: true } })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'actor_has_left' })
  })

  it('says nothing about the leaving date', async () => {
    // Desk asked not to hold one, and a date is not needed to close a door.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone', leftAt: PAST,
    })

    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone'))

    expect(Object.keys(res.body)).toEqual(['error'])
  })
})

describe('who is NOT refused', () => {
  it('somebody serving notice, whose last day is still ahead', async () => {
    // The expensive mistake in the other direction. A teacher who resigns in
    // March for a July date is working today, and locking them out four months
    // early would leave them no way in to report it.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Still Here', leftAt: FUTURE,
    })

    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-notice'))

    expect(res.status).toBe(200)
  })

  it('an ordinary current member of staff', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Current', leftAt: null,
    })

    expect((await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-ok'))).status).toBe(200)
  })

  it('an id Connect holds no row for — it may be a first-time actor', async () => {
    // Non-teaching staff reach this surface before Connect has ever seen them,
    // and the route provisions them from Hub. Refusing an unknown id HERE would
    // break reception's first request, and it is not this gate's question.
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-new'))

    // Falls through to the route's own resolution, which refuses with the
    // OTHER code: Connect has no row and Hub does not list them as staff here.
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'actor_not_known' })
  })

  it('tells the two refusals apart, which is the whole point of the codes', async () => {
    // Desk writes prose against these. "Ask an admin to run a Hub sync" is the
    // right advice for one and actively misleading for the other — it sends a
    // departed teacher to the office, and the office hunting a Hub bug that
    // does not exist. Previously Desk had to infer the difference from the
    // ABSENCE of a code, which was already wrong for any 403 raised by a proxy
    // ahead of us.
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone', leftAt: PAST,
    })
    const left = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone'))

    prismaMock.user.findUnique.mockResolvedValue(null)
    const unknown = await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-ghost'))

    expect(left.status).toBe(403)
    expect(unknown.status).toBe(403)
    expect(left.body.error).toBe('actor_has_left')
    expect(unknown.body.error).toBe('actor_not_known')
    expect(left.body.error).not.toBe(unknown.body.error)
  })

  it('a request that names no actor at all', async () => {
    // School-scoped lookups carry no hub_user_id. The gate must not invent one.
    await auth(request(makeApp()).get('/api/partner/staff/mentionable?school_id=hub-1'))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('every actor-bearing endpoint refuses, not just the one we tested', () => {
  // THE POINT OF THIS TABLE is not coverage for its own sake. Desk wrote its
  // leaver copy on the assumption that the refusal is UNIVERSAL — that a
  // departed teacher meets a closed door on any surface, so paths behind it
  // (withdraw, react, add a colleague) need no leaver wording of their own.
  //
  // That assumption is held today by this gate being middleware. If someone
  // later moves it into the routes and misses one, nothing in Desk's repo
  // fails: their page simply starts telling a permanently-refused person to
  // try again in a moment. This is the half of that coupling Connect CAN
  // check, so it breaks here instead.
  const ENDPOINTS: Array<[string, () => request.Test]> = [
    ['inbox/summary', () => request(makeApp()).get('/api/partner/inbox/summary?hub_user_id=hu-gone')],
    ['inbox/threads', () => request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone')],
    ['inbox/recipients', () => request(makeApp()).get('/api/partner/inbox/recipients?hub_user_id=hu-gone')],
    ['messages/sent', () => request(makeApp()).get('/api/partner/messages/sent?hub_user_id=hu-gone')],
    ['POST messages', () =>
      request(makeApp()).post('/api/partner/messages')
        .send({ hub_user_id: 'hu-gone', title: 'T', content: 'C', audience: { wholeSchool: true } }) as request.Test],
  ]

  for (const [name, call] of ENDPOINTS) {
    it(`${name} refuses a departed actor`, async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone', leftAt: PAST,
      })

      const res = await auth(call())

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'actor_has_left' })
      // And never reached the handler: no route-level read happened. This is
      // what "the gate is middleware" means, asserted rather than assumed.
      expect(prismaMock.conversation.findMany).not.toHaveBeenCalled()
      expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    })
  }
})

describe('the gate sits before the routes, not inside them', () => {
  it('asks once, by hubUserId, for the leaving date only', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u-1', role: 'STAFF', schoolId: 'sch-1', name: 'Gone', leftAt: PAST,
    })

    await auth(request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone'))

    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { hubUserId: 'hu-gone' },
      select: { leftAt: true },
    })
  })

  it('still refuses an invalid token first — a leaver learns nothing', async () => {
    prismaMock.partnerToken.findUnique.mockResolvedValue(null)

    const res = await request(makeApp()).get('/api/partner/inbox/threads?hub_user_id=hu-gone')
      .set('Authorization', 'Bearer cpk_wrong')

    expect(res.status).toBe(401)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
