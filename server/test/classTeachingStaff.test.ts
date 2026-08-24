import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Specialist teachers behind the parent inbox's contact list. Connect's
// StaffClassAssignment holds only Hub's class `teachers[]`, so PE / music /
// Arabic staff are read off the class's published timetable and matched to
// Connect users BY NAME — the one detail that has to be right, since a wrong
// match would send a parent's message to the wrong teacher.

const prismaMock = { user: { findMany: vi.fn() } }
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const cacheMock = { getClassDayCached: vi.fn(), getCalendarStructureCached: vi.fn() }
vi.mock('../src/services/timetableCache', () => cacheMock)

const { teachingStaffForClasses, timetableLookupPossible } = await import('../src/services/classTeachingStaff')

// One class day: PE with Mr Adams, maths with the class teacher.
function day(blocks: Array<{ subject: string | null; label?: string; teachers: string[] }>) {
  return {
    version_id: 'v1',
    state_hash: null,
    date: '2026-09-01',
    day: 1,
    week_label: null,
    blocks: blocks.map((b, i) => ({
      id: `b-${i}`,
      start: '09:00',
      end: '10:00',
      label: b.label ?? b.subject ?? 'Block',
      subject: b.subject ? { name: b.subject, color: null } : null,
      teacher: b.teachers[0] ? nameToTeacher(b.teachers[0]) : null,
      teachers: b.teachers.map(nameToTeacher),
      room: null,
      week: 'ALL',
      specialist: false,
      block_type: 'lesson',
    })),
  }
}
function nameToTeacher(full: string) {
  const [firstName, ...rest] = full.split(' ')
  return { firstName, lastName: rest.join(' ') }
}

const CLASSES = [{ classId: 'cls-1', hubClassId: 'hub-cls-1' }]
const OPTS = { hubSchoolId: 'hub-sch-1', today: '2026-09-02' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HUB_SERVICE_TOKEN = 'wsk_test'
  prismaMock.user.findMany.mockResolvedValue([
    { id: 'u-adams', name: 'Peter Adams', avatarUrl: null },
    { id: 'u-khan', name: 'Ms Sara Khan', avatarUrl: 'a.png' },
  ])
  // In term, so no resume-week redirection.
  cacheMock.getCalendarStructureCached.mockResolvedValue({
    terms: [{ starts_on: '2026-08-31', ends_on: '2026-12-18', half_terms: [] }],
  })
  cacheMock.getClassDayCached.mockResolvedValue(day([{ subject: 'PE', teachers: ['Peter Adams'] }]))
})
afterEach(() => {
  delete process.env.HUB_SERVICE_TOKEN
})

describe('teachingStaffForClasses', () => {
  it('resolves a timetable teacher to a Connect user, with the subjects they take', async () => {
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.get('cls-1')).toEqual([
      { userId: 'u-adams', name: 'Peter Adams', avatarUrl: null, subjects: ['PE'] },
    ])
  })

  it('matches across honorifics, case and punctuation ("Sara Khan" → "Ms Sara Khan")', async () => {
    cacheMock.getClassDayCached.mockResolvedValue(day([{ subject: 'Arabic', teachers: ['sara  khan'] }]))
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.get('cls-1')?.[0]).toMatchObject({ userId: 'u-khan', name: 'Ms Sara Khan' })
  })

  it('skips an ambiguous name rather than guessing between two staff', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-1', name: 'Peter Adams', avatarUrl: null },
      { id: 'u-2', name: 'Peter Adams', avatarUrl: null },
    ])
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.size).toBe(0)
  })

  it('skips a timetable name with no Connect staff account', async () => {
    cacheMock.getClassDayCached.mockResolvedValue(day([{ subject: 'Music', teachers: ['Nobody Here'] }]))
    expect((await teachingStaffForClasses('sch-1', CLASSES, OPTS)).size).toBe(0)
  })

  it('excludes the class teachers the caller already lists', async () => {
    const out = await teachingStaffForClasses('sch-1', CLASSES, {
      ...OPTS,
      excludeUserIds: new Set(['u-adams']),
    })
    expect(out.size).toBe(0)
  })

  it('collects distinct subjects across the week, in timetable order', async () => {
    cacheMock.getClassDayCached
      .mockResolvedValueOnce(day([{ subject: 'PE', teachers: ['Peter Adams'] }]))
      .mockResolvedValueOnce(day([{ subject: 'Swimming', teachers: ['Peter Adams'] }]))
      .mockResolvedValueOnce(day([{ subject: 'PE', teachers: ['Peter Adams'] }]))
      .mockResolvedValue(day([]))
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.get('cls-1')?.[0].subjects).toEqual(['PE', 'Swimming'])
  })

  it('reads the week lessons resume in when the current week is out of term', async () => {
    // Today is in the summer break; term starts 2026-08-31 (a Monday).
    cacheMock.getCalendarStructureCached.mockResolvedValue({
      terms: [{ starts_on: '2026-08-31', ends_on: '2026-12-18', half_terms: [] }],
    })
    await teachingStaffForClasses('sch-1', CLASSES, { ...OPTS, today: '2026-08-24' })
    const datesRead = cacheMock.getClassDayCached.mock.calls.map(c => c[2])
    expect(datesRead).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
  })

  it('a Hub failure on one day contributes nothing, the rest still resolve', async () => {
    cacheMock.getClassDayCached
      .mockRejectedValueOnce(new Error('hub down'))
      .mockResolvedValue(day([{ subject: 'PE', teachers: ['Peter Adams'] }]))
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.get('cls-1')?.[0].userId).toBe('u-adams')
  })

  it('a calendar failure just leaves us on this week (never throws)', async () => {
    cacheMock.getCalendarStructureCached.mockRejectedValue(new Error('nope'))
    const out = await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(out.get('cls-1')?.[0].userId).toBe('u-adams')
  })

  it('does nothing without a Hub token, an unlinked school, or an unlinked class', async () => {
    delete process.env.HUB_SERVICE_TOKEN
    expect((await teachingStaffForClasses('sch-1', CLASSES, OPTS)).size).toBe(0)
    expect(timetableLookupPossible('hub-sch-1')).toBe(false)

    process.env.HUB_SERVICE_TOKEN = 'wsk_test'
    expect((await teachingStaffForClasses('sch-1', CLASSES, { ...OPTS, hubSchoolId: null })).size).toBe(0)
    expect((await teachingStaffForClasses('sch-1', [{ classId: 'cls-1', hubClassId: null }], OPTS)).size).toBe(0)
    expect(cacheMock.getClassDayCached).not.toHaveBeenCalled()
  })

  it('only ever resolves staff-eligible users (never a parent or an ILSA)', async () => {
    await teachingStaffForClasses('sch-1', CLASSES, OPTS)
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1',
      role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] },
    })
  })

  it('ignores blocks with no named teacher (breaks, lunch)', async () => {
    cacheMock.getClassDayCached.mockResolvedValue(day([{ subject: null, label: 'Break', teachers: [] }]))
    expect((await teachingStaffForClasses('sch-1', CLASSES, OPTS)).size).toBe(0)
  })
})
