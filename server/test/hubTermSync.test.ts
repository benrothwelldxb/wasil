import { describe, it, expect, vi, beforeEach } from 'vitest'

// Exercise the Hub term-dates sync with the data layer and the MIS read-client
// mocked, so no database and no live Hub are needed. We assert the contract:
// two TermDate rows per Hub term (a term-start + a term-end) with the right
// type/color/date/term, idempotent find-then-write (no dupes on a re-run), and
// a prune that removes Hub-sourced rows whose term Hub dropped — but never a
// manual (hubTermId null) row.
const prismaMock = {
  school: { findUnique: vi.fn() },
  termDate: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/services/hubMis', () => ({
  listTerms: vi.fn(),
}))

const { listTerms } = await import('../src/services/hubMis')
const { syncTermDates } = await import('../src/services/hubTermSync')
const mListTerms = vi.mocked(listTerms)

const SCHOOL = { id: 'connect-school-1', hubSchoolId: 'hub-school-1' }

function term(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ht-1',
    name: 'Autumn Term',
    academicYear: '2026/27',
    startDate: '2026-08-31',
    endDate: '2026-12-11',
    isCurrent: false,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  prismaMock.school.findUnique.mockResolvedValue(SCHOOL)
  // Default: no existing row → create path. Individual tests override.
  prismaMock.termDate.findFirst.mockResolvedValue(null)
  prismaMock.termDate.create.mockResolvedValue({ id: 'td-new' })
  prismaMock.termDate.update.mockResolvedValue({ id: 'td-upd' })
  prismaMock.termDate.deleteMany.mockResolvedValue({ count: 0 })
})

describe('syncTermDates — upsert mapping', () => {
  it('writes two rows per Hub term (term-start green + term-end red) with correct fields', async () => {
    mListTerms.mockResolvedValue([term()])

    const summary = await syncTermDates('connect-school-1')

    expect(summary).toEqual({ skipped: false, upserted: 2, pruned: 0 })
    expect(prismaMock.termDate.create).toHaveBeenCalledTimes(2)

    const startData = prismaMock.termDate.create.mock.calls[0][0].data
    expect(startData).toMatchObject({
      term: 1,
      termName: 'Autumn Term',
      label: 'Autumn Term starts',
      type: 'term-start',
      color: 'green',
      academicYear: '2026/27',
      hubTermId: 'ht-1',
      schoolId: 'connect-school-1',
    })
    expect(startData.date).toEqual(new Date('2026-08-31'))

    const endData = prismaMock.termDate.create.mock.calls[1][0].data
    expect(endData).toMatchObject({
      term: 1,
      termName: 'Autumn Term',
      label: 'Autumn Term ends',
      type: 'term-end',
      color: 'red',
      academicYear: '2026/27',
      hubTermId: 'ht-1',
    })
    expect(endData.date).toEqual(new Date('2026-12-11'))
  })

  it('numbers terms 1..n by start-date order (not array order)', async () => {
    mListTerms.mockResolvedValue([
      term({ id: 'ht-summer', name: 'Summer Term', startDate: '2027-04-20', endDate: '2027-07-10' }),
      term({ id: 'ht-autumn', name: 'Autumn Term', startDate: '2026-08-31', endDate: '2026-12-11' }),
      term({ id: 'ht-spring', name: 'Spring Term', startDate: '2027-01-06', endDate: '2027-03-31' }),
    ])

    await syncTermDates('connect-school-1')

    // Rows are created start,end per term in start-date order.
    const byHub: Record<string, number> = {}
    for (const call of prismaMock.termDate.create.mock.calls) {
      const d = call[0].data
      byHub[d.hubTermId] = d.term
    }
    expect(byHub['ht-autumn']).toBe(1)
    expect(byHub['ht-spring']).toBe(2)
    expect(byHub['ht-summer']).toBe(3)
  })
})

describe('syncTermDates — idempotency', () => {
  it('updates the existing row (no duplicate create) when one exists for (hubTermId, type)', async () => {
    mListTerms.mockResolvedValue([term()])
    // Both find-then-write lookups return an existing row → update path.
    prismaMock.termDate.findFirst.mockImplementation(async ({ where }: any) => ({
      id: `existing-${where.type}`,
    }))

    const summary = await syncTermDates('connect-school-1')

    expect(summary.upserted).toBe(2)
    expect(prismaMock.termDate.create).not.toHaveBeenCalled()
    expect(prismaMock.termDate.update).toHaveBeenCalledTimes(2)
    // Keyed on (schoolId, hubTermId, type).
    const firstWhere = prismaMock.termDate.findFirst.mock.calls[0][0].where
    expect(firstWhere).toEqual({ schoolId: 'connect-school-1', hubTermId: 'ht-1', type: 'term-start' })
    expect(prismaMock.termDate.update.mock.calls[0][0].where).toEqual({ id: 'existing-term-start' })
  })
})

describe('syncTermDates — prune', () => {
  it('deletes Hub-sourced rows whose term Hub dropped, scoped to school + hubTermId not-in-current, never null', async () => {
    prismaMock.termDate.deleteMany.mockResolvedValue({ count: 2 })
    mListTerms.mockResolvedValue([term({ id: 'ht-keep' })])

    const summary = await syncTermDates('connect-school-1')

    expect(summary.pruned).toBe(2)
    const where = prismaMock.termDate.deleteMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('connect-school-1')
    // Only Hub-sourced rows (hubTermId non-null) NOT in the current Hub id set.
    expect(where.hubTermId).toEqual({ not: null, notIn: ['ht-keep'] })
  })

  it('when Hub returns zero terms, prunes ALL Hub-sourced rows (filter is just hubTermId non-null) — manual rows untouched', async () => {
    prismaMock.termDate.deleteMany.mockResolvedValue({ count: 4 })
    mListTerms.mockResolvedValue([])

    const summary = await syncTermDates('connect-school-1')

    expect(summary.upserted).toBe(0)
    expect(summary.pruned).toBe(4)
    const where = prismaMock.termDate.deleteMany.mock.calls[0][0].where
    // hubTermId non-null guard ensures manual (null) rows are structurally excluded.
    expect(where.hubTermId).toEqual({ not: null })
  })
})

describe('syncTermDates — dormant', () => {
  it('no-ops (skipped) when the school is not Hub-linked, without calling Hub or writing', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: null })

    const summary = await syncTermDates('connect-school-1')

    expect(summary).toEqual({ skipped: true, upserted: 0, pruned: 0 })
    expect(mListTerms).not.toHaveBeenCalled()
    expect(prismaMock.termDate.create).not.toHaveBeenCalled()
    expect(prismaMock.termDate.deleteMany).not.toHaveBeenCalled()
  })
})
