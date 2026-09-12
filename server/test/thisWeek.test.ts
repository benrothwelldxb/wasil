import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * "This Week" — a child's clubs and fixtures, read from Wasil Active.
 *
 * The whole risk of this screen is that three different failures all look like
 * a quiet week. Telling a family in writing that their child has no clubs, on
 * the morning after one was allocated, is worse than telling them nothing — so
 * the four states are distinct on the wire and each is pinned here.
 */
const prismaMock = { school: { findUnique: vi.fn() } }
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const loadUserWithRelations = vi.fn()
vi.mock('../src/middleware/auth', () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'p-1', schoolId: 'sch-1', role: 'PARENT' }
    next()
  },
  loadUserWithRelations,
}))

const fetchChildWeek = vi.fn()
vi.mock('../src/services/activeSchedule', async (orig) => {
  const real = await (orig() as Promise<any>)
  return { ...real, fetchChildWeek }
})

const { default: routes } = await import('../src/routes/thisWeek')

function makeApp() {
  const app = express()
  app.use('/api/this-week', routes)
  return app
}

const CHILD = { id: 'stu-1', firstName: 'Amira', lastName: 'Hassan', hubPupilId: 'hp-1' }
const asParentOf = (...students: unknown[]) =>
  loadUserWithRelations.mockResolvedValue({ studentLinks: students.map(student => ({ student })) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ACTIVE_API_URL', 'https://active.example')
  vi.stubEnv('ACTIVE_PARTNER_TOKEN', 'cpk_active')
  asParentOf(CHILD)
  // Both reads the route makes: the module gate, then the school's Hub id and
  // zone. The gate runs first and 404s without the flag.
  prismaMock.school.findUnique.mockResolvedValue({
    activeScheduleEnabled: true, hubSchoolId: 'hub-sch-1', timezone: 'Asia/Dubai',
  })
  fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', days: [], unknown: false })
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/this-week/child/:studentId — the guardian check', () => {
  // Active is asked by pupil and never by guardian, on purpose. That makes this
  // the ONLY place the household is checked, so a request for someone else's
  // child must not reach Active at all.
  it('404s a child who is not the requester’s, and asks Active nothing', async () => {
    asParentOf(CHILD)
    const res = await request(makeApp()).get('/api/this-week/child/stu-OTHER')

    expect(res.status).toBe(404)
    expect(fetchChildWeek).not.toHaveBeenCalled()
  })

  it('asks Active for the child’s Hub id, scoped to the school', async () => {
    await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(fetchChildWeek).toHaveBeenCalledWith(
      expect.objectContaining({ hubSchoolId: 'hub-sch-1', hubPupilId: 'hp-1' }),
    )
  })
})

// The switch has to close the ROUTE, not just hide the menu item — otherwise
// "off" means a link is missing while the data still flows to anyone with the
// URL, which is not an off switch.
describe('GET /api/this-week/child/:studentId — the module switch', () => {
  it('404s when the school does not have the module, and asks Active nothing', async () => {
    prismaMock.school.findUnique.mockResolvedValue({
      activeScheduleEnabled: false, hubSchoolId: 'hub-sch-1', timezone: 'Asia/Dubai',
    })

    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.status).toBe(404)
    // Nothing left Connect on this parent's behalf.
    expect(fetchChildWeek).not.toHaveBeenCalled()
  })
})

describe('GET /api/this-week/child/:studentId — the four states', () => {
  it('ok: a week, which may legitimately be quiet', async () => {
    fetchChildWeek.mockResolvedValue({
      timezone: 'Asia/Dubai',
      unknown: false,
      days: [{ date: '2026-09-14', items: [] }],
    })
    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('ok')
    // The only one of the four that may be shown as "nothing on".
    expect(res.body.days).toEqual([{ date: '2026-09-14', items: [] }])
  })

  it('not_synced: Active has never heard of the pupil — NOT an empty week', async () => {
    fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', days: [], unknown: true })
    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.status).toBe(200)
    expect(res.body.state).toBe('not_synced')
    expect(res.body.childName).toBe('Amira Hassan')
  })

  it('no_hub_link: nothing to ask Active about, and it isn’t asked', async () => {
    asParentOf({ ...CHILD, hubPupilId: null })
    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.body.state).toBe('no_hub_link')
    expect(fetchChildWeek).not.toHaveBeenCalled()
  })

  it('unavailable: unconfigured reads as unavailable, never as a quiet week', async () => {
    vi.stubEnv('ACTIVE_PARTNER_TOKEN', '')
    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.status).toBe(503)
    expect(res.body.state).toBe('unavailable')
  })

  // A missing `schedule:read` scope arrives as Active's 403. It is the config,
  // not the family's week, so it must not read as "no clubs" either.
  it('unavailable: Active’s own refusal, including a missing scope', async () => {
    const { ActiveScheduleError } = await import('../src/services/activeSchedule')
    fetchChildWeek.mockRejectedValue(
      new ActiveScheduleError(403, 'this token does not hold the "schedule:read" scope'),
    )
    const res = await request(makeApp()).get('/api/this-week/child/stu-1')

    expect(res.status).toBe(503)
    expect(res.body.state).toBe('unavailable')
  })
})

// Active builds `pupils[]` from the pupils it RECOGNISED, so a consumer that
// reads by position gets the wrong child's week the moment anyone in the batch
// is unknown — the exact case unknown_pupils exists to flag.
// A parent sees the same thing for every refusal — there is nothing a family
// can do about any of them — but the reason says which layer is broken, and
// they are three different jobs for three different people.
describe('GET /api/this-week/child/:studentId — why Active refused', () => {
  const refuse = async (status: number, body: string) => {
    const { ActiveScheduleError } = await import('../src/services/activeSchedule')
    fetchChildWeek.mockRejectedValue(new ActiveScheduleError(status, body))
    return request(makeApp()).get('/api/this-week/child/stu-1')
  }

  // Ours to fix, and permanent until we do — a retry will never help.
  it('404 reads as an unknown school, not as a transient outage', async () => {
    const res = await refuse(404, '{"error":"unknown school"}')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ state: 'unavailable', reason: 'unknown_school' })
  })

  it('403 reads as the missing scope', async () => {
    const res = await refuse(403, 'this token does not hold the "schedule:read" scope')
    expect(res.body.reason).toBe('scope')
  })

  it('anything else reads as upstream — the only one a retry helps', async () => {
    const res = await refuse(502, 'bad gateway')
    expect(res.body.reason).toBe('upstream')
  })

  // Whatever the reason, it is never a week.
  it('never renders a refusal as a quiet week', async () => {
    for (const status of [403, 404, 500]) {
      const res = await refuse(status, 'x')
      expect(res.body.state).toBe('unavailable')
      expect(res.body.days).toBeUndefined()
    }
  })
})

describe('fetchChildWeek — reads by id, never by position', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('picks the row whose hub_pupil_id matches, not the first one', async () => {
    const { fetchChildWeek } = await vi.importActual<typeof import('../src/services/activeSchedule')>(
      '../src/services/activeSchedule',
    )
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        timezone: 'Asia/Dubai',
        pupils: [
          { hub_pupil_id: 'hp-OTHER', days: [{ date: '2026-09-14', items: [{ name: 'not ours' }] }] },
          { hub_pupil_id: 'hp-1', days: [{ date: '2026-09-14', items: [{ name: 'ours' }] }] },
        ],
      }),
    })

    const week = await fetchChildWeek({
      hubSchoolId: 'hub-sch-1', hubPupilId: 'hp-1', from: '2026-09-14', to: '2026-09-20',
    })

    expect(week.days[0].items[0].name).toBe('ours')
  })
})

describe('schoolWeekBounds', () => {
  it('runs Monday to Sunday around the anchor date', async () => {
    const { schoolWeekBounds } = await import('../src/services/activeSchedule')
    // 2026-09-16 is a Wednesday.
    expect(schoolWeekBounds('Asia/Dubai', '2026-09-16')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
    // A Monday is its own week start, and a Sunday belongs to the week behind it.
    expect(schoolWeekBounds('Asia/Dubai', '2026-09-14').from).toBe('2026-09-14')
    expect(schoolWeekBounds('Asia/Dubai', '2026-09-20').from).toBe('2026-09-14')
  })

  // Seven days is inside Active's fortnight cap, which 400s a longer range.
  it('stays within the fortnight cap', async () => {
    const { schoolWeekBounds } = await import('../src/services/activeSchedule')
    const { from, to } = schoolWeekBounds('Asia/Dubai', '2026-09-16')
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1
    expect(days).toBe(7)
  })
})
