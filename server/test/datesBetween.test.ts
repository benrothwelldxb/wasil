import { describe, it, expect } from 'vitest'
import { datesBetween } from '../src/services/dateTime'

/**
 * A date somebody typed as a day must survive being stored.
 *
 * The version this replaces parsed LOCAL and formatted UTC:
 *
 *     const d = new Date(startDate + 'T00:00:00')   // the machine's midnight
 *     dates.push(d.toISOString().split('T')[0])     // ...printed in UTC
 *
 * In Dubai, 9 October becomes 2026-10-08T20:00:00Z, which prints as
 * "2026-10-08". Every consultation slot generated in the admin app was stored a
 * DAY EARLY — 448 of them for one evening.
 *
 * AND NO CONNECT SCREEN COULD SHOW IT. Every surface read the string back the
 * same way round — local parse, local format — which is the exact inverse of
 * the shift that created it. So it round-tripped to the day the admin picked,
 * on the admin app and the parent app alike. The stored value was wrong and
 * every screen we own agreed it was right.
 *
 * It took Desk, which renders dates zone-proof on purpose, to see a day Connect
 * could not. A zone-proof reader is the only thing that can catch a zone bug.
 *
 * These tests run under TZ=UTC in CI, where the OLD code passes too. That is
 * the point worth stating out loud: the property being pinned is that the
 * output does not depend on the machine, and the only honest way to check it is
 * the explicit-offset assertions below, which fail for a local-parse
 * implementation in any zone that is not UTC.
 */

describe('datesBetween', () => {
  it('returns the day it was given, not the day before', () => {
    expect(datesBetween('2026-10-09')).toEqual(['2026-10-09'])
  })

  it('walks an inclusive range', () => {
    expect(datesBetween('2026-10-07', '2026-10-09')).toEqual([
      '2026-10-07', '2026-10-08', '2026-10-09',
    ])
  })

  it('skips Saturday and Sunday when asked', () => {
    // 2026-10-09 is a Friday; the 10th and 11th are the UAE weekend.
    expect(datesBetween('2026-10-09', '2026-10-12', { weekdaysOnly: true })).toEqual([
      '2026-10-09', '2026-10-12',
    ])
  })

  it('keeps the weekend when not asked', () => {
    expect(datesBetween('2026-10-09', '2026-10-12')).toHaveLength(4)
  })

  it('is anchored in UTC, so a zone ahead of Greenwich cannot shift it', () => {
    // THE REGRESSION. Under the old implementation, run in Asia/Dubai, this
    // returned 2026-10-08 — and every slot generated from it was a day early.
    // Asserting the boundary explicitly rather than trusting the test runner's
    // zone: this is the one property that must not depend on the machine.
    const [first] = datesBetween('2026-10-09')
    expect(first).toBe('2026-10-09')
    expect(new Date(`${first}T00:00:00Z`).getUTCDate()).toBe(9)
    expect(new Date(`${first}T00:00:00Z`).getUTCMonth()).toBe(9) // October
  })

  it('crosses a month end', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ])
  })

  it('crosses a year end', () => {
    expect(datesBetween('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01'])
  })

  it('crosses a DST boundary without gaining or losing a day', () => {
    // 29 March 2026 is when most of Europe springs forward. Local-midnight
    // arithmetic can produce a duplicate or a missing day across that seam;
    // UTC arithmetic cannot.
    expect(datesBetween('2026-03-28', '2026-03-30')).toEqual([
      '2026-03-28', '2026-03-29', '2026-03-30',
    ])
  })

  it('treats a missing end date as a single day', () => {
    expect(datesBetween('2026-10-09', null)).toEqual(['2026-10-09'])
  })

  it('returns nothing for an unreadable date rather than an Invalid Date string', () => {
    expect(datesBetween('not-a-date')).toEqual([])
    expect(datesBetween('')).toEqual([])
  })

  it('returns nothing when the end precedes the start', () => {
    expect(datesBetween('2026-10-09', '2026-10-07')).toEqual([])
  })
})
