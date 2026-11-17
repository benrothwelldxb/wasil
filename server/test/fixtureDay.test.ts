import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * The home page's fixture card (GET /api/this-week/fixture-day) and the
 * school's "update to families" messages beside a fixture.
 *
 * Today's fixtures always; tomorrow's from 15:00 school time; an update from
 * the moment it is sent until its fixture's day is over. Updates are Connect's
 * own record, so they show even when Active cannot be read.
 */
const prismaMock = {
  school: { findUnique: vi.fn() },
  partnerIntent: { findMany: vi.fn() },
}
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

const clock = vi.hoisted(() => ({ now: { date: '2026-11-17', time: '10:00' } }))
vi.mock('../src/services/dateTime', async (orig) => {
  const real = await (orig() as Promise<any>)
  return { ...real, nowInTimezone: () => clock.now }
})

const { default: routes } = await import('../src/routes/thisWeek')

const app = () => express().use(express.json()).use('/api/this-week', routes)
const get = () => request(app()).get('/api/this-week/fixture-day')

const MAYA = { id: 'stu-maya', firstName: 'Maya', lastName: 'T', hubPupilId: 'hp-maya' }
const OMAR = { id: 'stu-omar', firstName: 'Omar', lastName: 'K', hubPupilId: 'hp-omar' }

const football = {
  kind: 'fixture', id: 'fx-1', name: 'U11 Girls Football v QES', starts_at: '17:00',
  departs_at: '15:30', returns_at: '18:20', venue: 'Home', status: 'scheduled',
}
const swim = { kind: 'club', id: 'cl-1', name: 'Swim Squad', starts_at: '15:15', ends_at: '16:15', status: 'scheduled' }

function update(over: Record<string, unknown> = {}) {
  return {
    studentId: 'stu-maya',
    occurredAt: new Date('2026-11-17T08:00:00Z'),
    payload: { fixtureId: 'fx-1', fixtureName: 'U11 Girls Football v QES', date: '2026-11-17', message: 'Kick-off moved to 17:30.', ...over },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ACTIVE_API_URL', 'https://active.example')
  vi.stubEnv('ACTIVE_PARTNER_TOKEN', 'tok')
  clock.now = { date: '2026-11-17', time: '10:00' }
  loadUserWithRelations.mockResolvedValue({ studentLinks: [{ student: MAYA }] })
  prismaMock.school.findUnique.mockResolvedValue({ activeScheduleEnabled: true, hubSchoolId: 'hub-1', timezone: 'Asia/Dubai' })
  prismaMock.partnerIntent.findMany.mockResolvedValue([])
  fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', unknown: false, days: [{ date: '2026-11-17', items: [swim, football] }] })
})
afterEach(() => vi.unstubAllEnvs())

describe('which fixtures the home page shows', () => {
  it("today's fixture, and not the clubs", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.cards).toHaveLength(1)
    expect(res.body.cards[0]).toMatchObject({ studentId: 'stu-maya', childName: 'Maya T', fixtureId: 'fx-1', date: '2026-11-17', item: football })
  })

  it('asks Active for today only before 15:00', async () => {
    await get()
    expect(fetchChildWeek).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-11-17', to: '2026-11-17' }))
  })

  it("includes tomorrow's from 15:00 the day before", async () => {
    clock.now = { date: '2026-11-17', time: '15:00' }
    await get()
    expect(fetchChildWeek).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-11-17', to: '2026-11-18' }))
  })

  it('a played fixture is over and is not shown', async () => {
    fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', unknown: false, days: [{ date: '2026-11-17', items: [{ ...football, status: 'played' }] }] })
    expect((await get()).body.cards).toEqual([])
  })

  it('a cancelled fixture still shows, so the parent learns it is off', async () => {
    fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', unknown: false, days: [{ date: '2026-11-17', items: [{ ...football, status: 'cancelled', cancellation_reason: 'Waterlogged pitch' }] }] })
    expect((await get()).body.cards[0].item.status).toBe('cancelled')
  })

  it('one card per child, for siblings', async () => {
    loadUserWithRelations.mockResolvedValue({ studentLinks: [{ student: MAYA }, { student: OMAR }] })
    expect((await get()).body.cards.map((c: any) => c.childName)).toEqual(['Maya T', 'Omar K'])
  })
})

describe('updates to families', () => {
  it("sit on the fixture's card", async () => {
    prismaMock.partnerIntent.findMany.mockResolvedValue([update()])
    const card = (await get()).body.cards[0]
    expect(card.updates).toEqual([{ message: 'Kick-off moved to 17:30.', sentAt: '2026-11-17T08:00:00.000Z' }])
  })

  it('reads only delivered updates for this family\'s children', async () => {
    await get()
    expect(prismaMock.partnerIntent.findMany.mock.calls[0][0].where).toMatchObject({
      eventType: 'fixture.update', status: 'DELIVERED', studentId: { in: ['stu-maya'] },
    })
  })

  it('show from the moment they are sent, for a fixture days away', async () => {
    fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', unknown: false, days: [{ date: '2026-11-17', items: [] }] })
    prismaMock.partnerIntent.findMany.mockResolvedValue([update({ fixtureId: 'fx-9', fixtureName: 'Netball v JESS', date: '2026-11-24' })])
    const cards = (await get()).body.cards
    expect(cards).toEqual([expect.objectContaining({ fixtureId: 'fx-9', name: 'Netball v JESS', date: '2026-11-24', item: null })])
  })

  it('are gone once the fixture day has passed', async () => {
    prismaMock.partnerIntent.findMany.mockResolvedValue([update({ date: '2026-11-16' })])
    fetchChildWeek.mockResolvedValue({ timezone: 'Asia/Dubai', unknown: false, days: [{ date: '2026-11-17', items: [] }] })
    expect((await get()).body.cards).toEqual([])
  })

  it('still show when Active cannot be read, and say the times are missing', async () => {
    fetchChildWeek.mockRejectedValue(new Error('active down'))
    prismaMock.partnerIntent.findMany.mockResolvedValue([update()])
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.scheduleUnavailable).toBe(true)
    expect(res.body.cards[0].updates[0].message).toBe('Kick-off moved to 17:30.')
  })
})

describe('This Week carries the same updates', () => {
  it('by fixture id, for the week shown', async () => {
    prismaMock.partnerIntent.findMany.mockResolvedValue([update()])
    const res = await request(app()).get('/api/this-week/child/stu-maya?weekOf=2026-11-17')
    expect(res.body.fixtureUpdates).toEqual({ 'fx-1': [{ message: 'Kick-off moved to 17:30.', sentAt: '2026-11-17T08:00:00.000Z' }] })
  })
})
