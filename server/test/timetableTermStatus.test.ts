import { describe, it, expect, vi } from 'vitest'

// computeTermStatus is pure, but importing the route module evaluates its
// imports (prisma etc.), so stub the heavy ones.
vi.mock('../src/services/prisma', () => ({ default: {} }))

import { computeTermStatus } from '../src/routes/timetable'
import type { HubCalendarStructure } from '../src/services/hubMis'

// One term split into two teaching half-terms with a half-term break in between:
//   HT1: 2026-09-01 .. 2026-10-16    [break 10-17 .. 10-25]    HT2: 2026-10-26 .. 2026-12-18
const structure: HubCalendarStructure = {
  academic_year: { id: 'ay', name: '2026-27', starts_on: '2026-09-01', ends_on: '2027-07-10' },
  terms: [
    {
      id: 't1',
      name: 'Autumn',
      starts_on: '2026-09-01',
      ends_on: '2026-12-18',
      half_terms: [
        { id: 'h1', name: 'Autumn 1', starts_on: '2026-09-01', ends_on: '2026-10-16' },
        { id: 'h2', name: 'Autumn 2', starts_on: '2026-10-26', ends_on: '2026-12-18' },
      ],
    },
    {
      id: 't2',
      name: 'Spring',
      starts_on: '2027-01-05',
      ends_on: '2027-03-26',
      // No half_terms → the whole term is one teaching period.
    },
  ],
}

describe('computeTermStatus', () => {
  it('is in term for a normal teaching week (no banner)', () => {
    expect(computeTermStatus(structure, '2026-09-07', '2026-09-11')).toEqual({
      outOfTerm: false,
      resumeDate: null,
    })
  })

  it('flags a half-term break week as out of term, resuming at the next half-term', () => {
    expect(computeTermStatus(structure, '2026-10-19', '2026-10-23')).toEqual({
      outOfTerm: true,
      resumeDate: '2026-10-26',
    })
  })

  it('flags the summer holiday (before the year starts) and resumes at term 1', () => {
    expect(computeTermStatus(structure, '2026-08-17', '2026-08-21')).toEqual({
      outOfTerm: true,
      resumeDate: '2026-09-01',
    })
  })

  it('flags the Christmas break and resumes at the spring (whole-term) period', () => {
    expect(computeTermStatus(structure, '2026-12-21', '2026-12-25')).toEqual({
      outOfTerm: true,
      resumeDate: '2027-01-05',
    })
  })

  it('treats a week straddling a term boundary as in term (partial overlap)', () => {
    // Fri lands on the first teaching day → overlaps, so no banner.
    expect(computeTermStatus(structure, '2026-08-31', '2026-09-04')).toEqual({
      outOfTerm: false,
      resumeDate: null,
    })
  })

  it('returns null resumeDate when out of term with nothing ahead (end of year)', () => {
    expect(computeTermStatus(structure, '2027-08-02', '2027-08-06')).toEqual({
      outOfTerm: true,
      resumeDate: null,
    })
  })

  it('never flags when the structure has no terms (best-effort no-op)', () => {
    const empty: HubCalendarStructure = {
      academic_year: { id: 'ay', name: 'x', starts_on: '2026-09-01', ends_on: '2027-07-10' },
      terms: [],
    }
    expect(computeTermStatus(empty, '2026-10-19', '2026-10-23')).toEqual({
      outOfTerm: false,
      resumeDate: null,
    })
  })
})
