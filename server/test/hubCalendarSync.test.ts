import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Exercise the Hub calendar sync with the data layer and the calendar
// read-client mocked, so no database and no live Hub are needed. We assert the
// contract: idempotent upserts keyed on hubCalendarEventId, cohort → EventTarget
// mapping (whole-school → none; names → resolved rows; unresolved → skipped, not
// fatal), and a dormant no-op when the service token is unset.
const prismaMock = {
  school: { findUnique: vi.fn(), update: vi.fn() },
  class: { findMany: vi.fn() },
  yearGroup: { findMany: vi.fn() },
  event: { upsert: vi.fn() },
  eventTarget: { deleteMany: vi.fn(), createMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/services/hubCalendar', () => ({
  getEvents: vi.fn(),
}))

const { getEvents } = await import('../src/services/hubCalendar')
const { syncCalendar } = await import('../src/services/hubCalendarSync')
const mGetEvents = vi.mocked(getEvents)

const SCHOOL = {
  id: 'connect-school-1',
  hubSchoolId: 'hub-school-1',
  timezone: 'Asia/Dubai',
  hubCalendarCursor: null,
}
const WINDOW = { from: '2026-07-01', to: '2027-06-30' }

function dto(overrides: any = {}) {
  return {
    id: 'hev-1',
    title: 'Sports Day',
    description: 'Annual sports day',
    category: 'GENERAL',
    location: 'Main field',
    all_day: false,
    starts_at: '2026-09-10T05:00:00.000Z', // 09:00 Asia/Dubai
    ends_at: '2026-09-10T09:00:00.000Z',
    kit: false,
    cohort: { whole_school: true },
    ...overrides,
  }
}

function eventsResponse(events: any[], cursor: number | null = 42) {
  return { from: WINDOW.from, to: WINDOW.to, events, state_hash: 'h', cursor }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  prismaMock.school.findUnique.mockResolvedValue(SCHOOL)
  prismaMock.school.update.mockResolvedValue(SCHOOL)
  prismaMock.class.findMany.mockResolvedValue([])
  prismaMock.yearGroup.findMany.mockResolvedValue([])
  prismaMock.event.upsert.mockImplementation(async ({ where }: any) => ({
    id: 'ce-' + where.hubCalendarEventId,
    hubCalendarEventId: where.hubCalendarEventId,
  }))
  prismaMock.eventTarget.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.eventTarget.createMany.mockResolvedValue({ count: 0 })
})

afterEach(() => {
  delete process.env.HUB_SERVICE_TOKEN
})

describe('syncCalendar — upsert + idempotency', () => {
  it('upserts each Hub event keyed on hubCalendarEventId, and re-upserts (never bare-creates) on a second run', async () => {
    mGetEvents.mockResolvedValue(eventsResponse([dto()]))

    const first = await syncCalendar('connect-school-1', WINDOW)
    const second = await syncCalendar('connect-school-1', WINDOW)

    expect(first.upserted).toBe(1)
    expect(second.upserted).toBe(1)
    // Both runs key on the same hubCalendarEventId — a re-run updates the row.
    for (const call of prismaMock.event.upsert.mock.calls) {
      expect((call[0] as any).where).toEqual({ hubCalendarEventId: 'hev-1' })
      expect((call[0] as any).create.hubCalendarEventId).toBe('hev-1')
      expect((call[0] as any).create.schoolId).toBe('connect-school-1')
    }
    // Field mapping: starts_at → school-local date + time; all_day=false → time set.
    const createData = (prismaMock.event.upsert.mock.calls[0][0] as any).create
    expect(createData.title).toBe('Sports Day')
    expect(createData.location).toBe('Main field')
    expect(createData.time).toBe('09:00')
    expect(createData.date).toBeInstanceOf(Date)
    // The /changes cursor is persisted per school.
    expect(prismaMock.school.update).toHaveBeenCalledWith({
      where: { id: 'connect-school-1' },
      data: { hubCalendarCursor: 42 },
    })
  })

  it('all_day event stores a null time', async () => {
    mGetEvents.mockResolvedValue(eventsResponse([dto({ all_day: true })]))
    await syncCalendar('connect-school-1', WINDOW)
    expect((prismaMock.event.upsert.mock.calls[0][0] as any).create.time).toBeNull()
  })
})

describe('syncCalendar — cohort mapping', () => {
  it('whole-school cohort writes no EventTarget rows and labels targetClass "Whole School"', async () => {
    mGetEvents.mockResolvedValue(eventsResponse([dto({ cohort: { whole_school: true } })]))

    const summary = await syncCalendar('connect-school-1', WINDOW)

    const createData = (prismaMock.event.upsert.mock.calls[0][0] as any).create
    expect(createData.targetClass).toBe('Whole School')
    expect(createData.classId).toBeNull()
    expect(createData.yearGroupId).toBeNull()
    // Targets are replaced (deleteMany) but no rows written for whole-school.
    expect(prismaMock.eventTarget.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ce-hev-1' } })
    expect(prismaMock.eventTarget.createMany).not.toHaveBeenCalled()
    expect(summary.targetsResolved).toBe(0)
  })

  it('resolves cohort class + year-group NAMES to Connect EventTarget rows', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-1', name: '1 Blue' }])
    prismaMock.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 2' }])
    mGetEvents.mockResolvedValue(
      eventsResponse([dto({ cohort: { year_groups: ['Year 2'], classes: ['1 Blue'] } })]),
    )

    const summary = await syncCalendar('connect-school-1', WINDOW)

    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [
        { eventId: 'ce-hev-1', classId: null, yearGroupId: 'yg-1' },
        { eventId: 'ce-hev-1', classId: 'cc-1', yearGroupId: null },
      ],
    })
    expect(summary.targetsResolved).toBe(2)
    expect(summary.targetsSkipped).toBe(0)
    // Two targets → ambiguous, so legacy scalars stay null.
    const createData = (prismaMock.event.upsert.mock.calls[0][0] as any).create
    expect(createData.classId).toBeNull()
    expect(createData.yearGroupId).toBeNull()
  })

  it('populates the legacy scalar classId when a single class target resolves', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-9', name: 'Reception Red' }])
    mGetEvents.mockResolvedValue(
      eventsResponse([dto({ cohort: { year_groups: [], classes: ['Reception Red'] } })]),
    )

    await syncCalendar('connect-school-1', WINDOW)

    const createData = (prismaMock.event.upsert.mock.calls[0][0] as any).create
    expect(createData.classId).toBe('cc-9')
    expect(createData.yearGroupId).toBeNull()
  })

  it('skips an unresolved cohort target without failing the sync', async () => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cc-1', name: '1 Blue' }])
    mGetEvents.mockResolvedValue(
      eventsResponse([dto({ cohort: { year_groups: [], classes: ['1 Blue', 'Ghost Class'] } })]),
    )

    const summary = await syncCalendar('connect-school-1', WINDOW)

    expect(summary.upserted).toBe(1)
    expect(summary.targetsResolved).toBe(1)
    expect(summary.targetsSkipped).toBe(1)
    // Only the resolved class becomes a target row.
    expect(prismaMock.eventTarget.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'ce-hev-1', classId: 'cc-1', yearGroupId: null }],
    })
  })
})

describe('syncCalendar — dormant', () => {
  it('no-ops (never throws, never touches the DB) when the service token is unset', async () => {
    delete process.env.HUB_SERVICE_TOKEN
    const summary = await syncCalendar('connect-school-1', WINDOW)

    expect(summary).toEqual({
      skipped: true,
      reason: 'no_service_token',
      upserted: 0,
      targetsResolved: 0,
      targetsSkipped: 0,
      cursor: null,
    })
    expect(mGetEvents).not.toHaveBeenCalled()
    expect(prismaMock.school.findUnique).not.toHaveBeenCalled()
  })

  it('no-ops when the school is not Hub-linked', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: null })
    const summary = await syncCalendar('connect-school-1', WINDOW)
    expect(summary.skipped).toBe(true)
    expect(summary.reason).toBe('school_not_linked')
    expect(mGetEvents).not.toHaveBeenCalled()
  })

  it('no-ops when the calendar is unavailable to this token (no scope / 404 → null)', async () => {
    mGetEvents.mockResolvedValue(null)
    const summary = await syncCalendar('connect-school-1', WINDOW)
    expect(summary.skipped).toBe(true)
    expect(summary.reason).toBe('calendar_unavailable')
    expect(prismaMock.event.upsert).not.toHaveBeenCalled()
  })
})
