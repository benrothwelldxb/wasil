import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Calendar change markers.
 *
 * Hub pushes `calendar.updated` and Connect re-syncs immediately, upserting in
 * place. That silence is the problem: a parent who wrote the old date down
 * finds the new one and no reason to doubt their own memory.
 *
 * The two ways a naive version is worse than nothing are what these cover — a
 * bulk edit read as forty reschedules, and a change to something a parent can
 * no longer act on.
 */
const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  class: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  event: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  eventTarget: { deleteMany: vi.fn(), createMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const getEvents = vi.fn()
vi.mock('../src/services/hubCalendar', () => ({ getEvents: (...a: unknown[]) => getEvents(...a) }))

process.env.HUB_SERVICE_TOKEN = 'svc'
const { syncCalendar, defaultCalendarWindow } = await import('../src/services/hubCalendarSync')

/** A date well in the future, so "can a parent still act on this" is never the
 *  thing under test unless a case says so. */
const future = (daysAhead: number) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
const iso = (d: Date) => d.toISOString()

const hubEvent = (id: string, startsAt: Date, over: Record<string, unknown> = {}) => ({
  id,
  title: `Event ${id}`,
  description: null,
  starts_at: iso(startsAt),
  all_day: true,
  audience: 'WHOLE_SCHOOL',
  cohort: null,
  location: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({
    id: 'sch-1', hubSchoolId: 'hub-1', timezone: 'Asia/Dubai',
  })
  prismaMock.class.findMany.mockResolvedValue([])
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.event.findFirst.mockResolvedValue(null)
  prismaMock.event.upsert.mockImplementation(async () => ({ id: 'evt-1' }))
  prismaMock.event.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.event.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.eventTarget.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.eventTarget.createMany.mockResolvedValue({ count: 0 })
  prismaMock.school.update.mockResolvedValue({})
})

/** The change markers written this run. */
const marked = () =>
  prismaMock.event.updateMany.mock.calls
    .map((c) => c[0])
    .filter((a) => a?.data?.changedAt)

describe('calendar sync change markers', () => {
  it('marks an event whose date moved, with the date it moved from', async () => {
    const was = future(20)
    const now = future(27)
    prismaMock.event.findMany.mockResolvedValue([
      { hubCalendarEventId: 'h-1', date: was, time: null, location: null },
    ])
    getEvents.mockResolvedValue({ events: [hubEvent('h-1', now)], cursor: null })

    const summary = await syncCalendar('sch-1', defaultCalendarWindow())

    expect(summary.changesMarked).toBe(1)
    expect(summary.changesSuppressed).toBe(0)
    const write = marked()[0]
    expect(write.where).toMatchObject({ schoolId: 'sch-1', hubCalendarEventId: 'h-1' })
    expect(write.data.previousDate).toEqual(was)
  })

  it('marks a location move, keeping where it was', async () => {
    const when = future(20)
    prismaMock.event.findMany.mockResolvedValue([
      { hubCalendarEventId: 'h-1', date: when, time: null, location: 'Hall' },
    ])
    getEvents.mockResolvedValue({ events: [hubEvent('h-1', when, { location: 'Field' })], cursor: null })

    await syncCalendar('sch-1', defaultCalendarWindow())

    expect(marked()[0].data.previousLocation).toBe('Hall')
  })

  // A new event has not "changed" — every event would be marked on the first
  // sync, and the strip would open on a wall of things nobody moved.
  it('does not mark an event it has never seen before', async () => {
    prismaMock.event.findMany.mockResolvedValue([])
    getEvents.mockResolvedValue({ events: [hubEvent('h-new', future(20))], cursor: null })

    const summary = await syncCalendar('sch-1', defaultCalendarWindow())

    expect(summary.changesMarked).toBe(0)
    expect(marked()).toHaveLength(0)
  })

  it('does not mark an event that has not moved', async () => {
    const when = future(20)
    prismaMock.event.findMany.mockResolvedValue([
      { hubCalendarEventId: 'h-1', date: when, time: null, location: null },
    ])
    getEvents.mockResolvedValue({ events: [hubEvent('h-1', when)], cursor: null })

    const summary = await syncCalendar('sch-1', defaultCalendarWindow())
    expect(summary.changesMarked).toBe(0)
  })

  // A parent cannot act on last month's event, and telling them it moved is
  // noise dressed as information.
  it('ignores a change to an event that has already happened', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      { hubCalendarEventId: 'h-1', date: future(-40), time: null, location: null },
    ])
    getEvents.mockResolvedValue({ events: [hubEvent('h-1', future(-30))], cursor: null })

    const summary = await syncCalendar('sch-1', defaultCalendarWindow())
    expect(summary.changesMarked).toBe(0)
  })

  describe('a bulk edit is one edit, not many reschedules', () => {
    // An admin correcting a term's dates, or Hub re-keying its calendar, moves
    // many at once. Marking them all fills a parent's dashboard with a wall of
    // "moved" that says nothing about any particular event.
    it('marks nothing when a great many events move at once, and records why', async () => {
      const existing = []
      const incoming = []
      for (let i = 0; i < 25; i++) {
        existing.push({ hubCalendarEventId: `h-${i}`, date: future(20 + i), time: null, location: null })
        incoming.push(hubEvent(`h-${i}`, future(40 + i)))
      }
      prismaMock.event.findMany.mockResolvedValue(existing)
      getEvents.mockResolvedValue({ events: incoming, cursor: null })

      const summary = await syncCalendar('sch-1', defaultCalendarWindow())

      expect(summary.changesMarked).toBe(0)
      expect(summary.changesSuppressed).toBe(25)
      expect(marked()).toHaveLength(0)
    })

    // The events themselves are still corrected — only the flags are withheld.
    it('still applies the new dates when it suppresses the markers', async () => {
      const existing = []
      const incoming = []
      for (let i = 0; i < 25; i++) {
        existing.push({ hubCalendarEventId: `h-${i}`, date: future(20 + i), time: null, location: null })
        incoming.push(hubEvent(`h-${i}`, future(40 + i)))
      }
      prismaMock.event.findMany.mockResolvedValue(existing)
      getEvents.mockResolvedValue({ events: incoming, cursor: null })

      const summary = await syncCalendar('sch-1', defaultCalendarWindow())
      expect(summary.upserted).toBe(25)
      expect(prismaMock.event.upsert).toHaveBeenCalledTimes(25)
    })

    it('a handful of real reschedules is still marked', async () => {
      const existing = []
      const incoming = []
      for (let i = 0; i < 3; i++) {
        existing.push({ hubCalendarEventId: `h-${i}`, date: future(20 + i), time: null, location: null })
        incoming.push(hubEvent(`h-${i}`, future(40 + i)))
      }
      prismaMock.event.findMany.mockResolvedValue(existing)
      getEvents.mockResolvedValue({ events: incoming, cursor: null })

      const summary = await syncCalendar('sch-1', defaultCalendarWindow())
      expect(summary.changesMarked).toBe(3)
      expect(summary.changesSuppressed).toBe(0)
    })
  })

  // Staff-only events never reach a parent surface, so they cannot generate a
  // parent-facing "this moved" either.
  it('never marks a staff-only event', async () => {
    prismaMock.event.findMany.mockResolvedValue([
      { hubCalendarEventId: 'h-1', date: future(20), time: null, location: null },
    ])
    getEvents.mockResolvedValue({
      events: [hubEvent('h-1', future(30), { audience: 'STAFF_ONLY' })],
      cursor: null,
    })

    const summary = await syncCalendar('sch-1', defaultCalendarWindow())
    expect(summary.changesMarked).toBe(0)
  })
})
