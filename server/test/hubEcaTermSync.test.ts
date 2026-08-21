import { describe, it, expect, vi, beforeEach } from 'vitest'

// Exercise the Hub ECA-term sync with the data layer and the MIS read-client
// mocked, so no database and no live Hub are needed. We assert the ownership
// contract: one EcaTerm per Hub term, created in DRAFT with Hub identity and NO
// registration window; a re-sync refreshes identity but NEVER touches the
// admin-owned workflow state (status, registration windows, session times);
// and a safe prune that deletes an EMPTY Hub-dropped term but leaves a
// non-empty one (and never a manual, hubTermId-null, term).
const prismaMock = {
  school: { findUnique: vi.fn() },
  ecaTerm: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

vi.mock('../src/services/hubMis', () => ({
  listTerms: vi.fn(),
}))

const { listTerms } = await import('../src/services/hubMis')
const { syncEcaTerms } = await import('../src/services/hubEcaTermSync')
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
  // Default: no existing term → create path. Individual tests override.
  prismaMock.ecaTerm.findFirst.mockResolvedValue(null)
  prismaMock.ecaTerm.create.mockResolvedValue({ id: 'et-new' })
  prismaMock.ecaTerm.update.mockResolvedValue({ id: 'et-upd' })
  // Default: nothing to prune.
  prismaMock.ecaTerm.findMany.mockResolvedValue([])
  prismaMock.ecaTerm.delete.mockResolvedValue({ id: 'et-del' })
})

describe('syncEcaTerms — create', () => {
  it('creates one DRAFT term per Hub term with Hub identity and NO registration window', async () => {
    mListTerms.mockResolvedValue([term()])

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary).toEqual({ skipped: false, created: 1, updated: 0, pruned: 0, prunedSkippedNonEmpty: 0 })
    expect(prismaMock.ecaTerm.create).toHaveBeenCalledTimes(1)

    const data = prismaMock.ecaTerm.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      schoolId: 'connect-school-1',
      hubTermId: 'ht-1',
      name: 'Autumn Term',
      academicYear: '2026/27',
      termNumber: 1,
      status: 'DRAFT',
    })
    expect(data.startDate).toEqual(new Date('2026-08-31'))
    expect(data.endDate).toEqual(new Date('2026-12-11'))
    // Workflow state is left unset — admin fills it in.
    expect(data.registrationOpens).toBeUndefined()
    expect(data.registrationCloses).toBeUndefined()
    expect(data.defaultBeforeSchoolStart).toBeUndefined()
    expect(data.defaultAfterSchoolStart).toBeUndefined()
    // Find-or-create keyed on (schoolId, hubTermId).
    expect(prismaMock.ecaTerm.findFirst.mock.calls[0][0].where).toEqual({
      schoolId: 'connect-school-1',
      hubTermId: 'ht-1',
    })
  })

  it('numbers terms 1..n by start-date order (not array order)', async () => {
    mListTerms.mockResolvedValue([
      term({ id: 'ht-summer', name: 'Summer Term', startDate: '2027-04-20', endDate: '2027-07-10' }),
      term({ id: 'ht-autumn', name: 'Autumn Term', startDate: '2026-08-31', endDate: '2026-12-11' }),
      term({ id: 'ht-spring', name: 'Spring Term', startDate: '2027-01-06', endDate: '2027-03-31' }),
    ])

    await syncEcaTerms('connect-school-1')

    const byHub: Record<string, number> = {}
    for (const call of prismaMock.ecaTerm.create.mock.calls) {
      const d = call[0].data
      byHub[d.hubTermId] = d.termNumber
    }
    expect(byHub['ht-autumn']).toBe(1)
    expect(byHub['ht-spring']).toBe(2)
    expect(byHub['ht-summer']).toBe(3)
  })
})

describe('syncEcaTerms — re-sync (identity refresh, workflow preserved)', () => {
  it('updates only Hub identity fields on an existing term (never status/registration/session times)', async () => {
    mListTerms.mockResolvedValue([
      term({ name: 'Autumn Term (renamed)', startDate: '2026-09-01', endDate: '2026-12-18' }),
    ])
    prismaMock.ecaTerm.findFirst.mockResolvedValue({
      id: 'et-existing',
      hubTermId: 'ht-1',
      status: 'REGISTRATION_OPEN',
    })

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary).toEqual({ skipped: false, created: 0, updated: 1, pruned: 0, prunedSkippedNonEmpty: 0 })
    expect(prismaMock.ecaTerm.create).not.toHaveBeenCalled()
    expect(prismaMock.ecaTerm.update).toHaveBeenCalledTimes(1)

    const call = prismaMock.ecaTerm.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'et-existing' })
    // Only identity keys are written — no workflow keys present at all.
    expect(Object.keys(call.data).sort()).toEqual(
      ['academicYear', 'endDate', 'name', 'startDate', 'termNumber'].sort(),
    )
    expect(call.data.name).toBe('Autumn Term (renamed)')
    expect(call.data.startDate).toEqual(new Date('2026-09-01'))
    expect(call.data).not.toHaveProperty('status')
    expect(call.data).not.toHaveProperty('registrationOpens')
    expect(call.data).not.toHaveProperty('registrationCloses')
    expect(call.data).not.toHaveProperty('defaultBeforeSchoolStart')
    expect(call.data).not.toHaveProperty('allocationRun')
  })

  it('is idempotent — a second run over the same term re-updates, never re-creates', async () => {
    mListTerms.mockResolvedValue([term()])
    prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'et-existing', hubTermId: 'ht-1', status: 'DRAFT' })

    await syncEcaTerms('connect-school-1')
    await syncEcaTerms('connect-school-1')

    expect(prismaMock.ecaTerm.create).not.toHaveBeenCalled()
    expect(prismaMock.ecaTerm.update).toHaveBeenCalledTimes(2)
  })
})

describe('syncEcaTerms — prune', () => {
  it('finds Hub-dropped terms scoped to school + hubTermId not-in-current, never null', async () => {
    mListTerms.mockResolvedValue([term({ id: 'ht-keep' })])
    prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'et-keep', hubTermId: 'ht-keep', status: 'DRAFT' })
    // One dropped, empty term to prune.
    prismaMock.ecaTerm.findMany.mockResolvedValue([
      { id: 'et-dropped', _count: { activities: 0 } },
    ])

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary.pruned).toBe(1)
    expect(summary.prunedSkippedNonEmpty).toBe(0)
    const where = prismaMock.ecaTerm.findMany.mock.calls[0][0].where
    expect(where.schoolId).toBe('connect-school-1')
    expect(where.hubTermId).toEqual({ not: null, notIn: ['ht-keep'] })
    expect(prismaMock.ecaTerm.delete).toHaveBeenCalledWith({ where: { id: 'et-dropped' } })
  })

  it('does NOT delete a Hub-dropped term that has activities — keeps it, counts it skipped', async () => {
    mListTerms.mockResolvedValue([term({ id: 'ht-keep' })])
    prismaMock.ecaTerm.findFirst.mockResolvedValue({ id: 'et-keep', hubTermId: 'ht-keep', status: 'DRAFT' })
    prismaMock.ecaTerm.findMany.mockResolvedValue([
      { id: 'et-empty', _count: { activities: 0 } },
      { id: 'et-has-clubs', _count: { activities: 3 } },
    ])

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary.pruned).toBe(1)
    expect(summary.prunedSkippedNonEmpty).toBe(1)
    expect(prismaMock.ecaTerm.delete).toHaveBeenCalledTimes(1)
    expect(prismaMock.ecaTerm.delete).toHaveBeenCalledWith({ where: { id: 'et-empty' } })
    // The non-empty Hub-dropped term is left in place.
    expect(prismaMock.ecaTerm.delete).not.toHaveBeenCalledWith({ where: { id: 'et-has-clubs' } })
  })

  it('when Hub returns zero terms, prune filter is just hubTermId non-null (manual terms structurally excluded)', async () => {
    mListTerms.mockResolvedValue([])
    prismaMock.ecaTerm.findMany.mockResolvedValue([])

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary.created).toBe(0)
    const where = prismaMock.ecaTerm.findMany.mock.calls[0][0].where
    expect(where.hubTermId).toEqual({ not: null })
  })
})

describe('syncEcaTerms — dormant', () => {
  it('no-ops (skipped) when the school is not Hub-linked, without calling Hub or writing', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ id: 'connect-school-1', hubSchoolId: null })

    const summary = await syncEcaTerms('connect-school-1')

    expect(summary).toEqual({ skipped: true, created: 0, updated: 0, pruned: 0, prunedSkippedNonEmpty: 0 })
    expect(mListTerms).not.toHaveBeenCalled()
    expect(prismaMock.ecaTerm.create).not.toHaveBeenCalled()
    expect(prismaMock.ecaTerm.findMany).not.toHaveBeenCalled()
    expect(prismaMock.ecaTerm.delete).not.toHaveBeenCalled()
  })
})
