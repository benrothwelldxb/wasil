import { describe, it, expect, vi } from 'vitest'

// The helper is pure, but its module pulls in Prisma for `todayForSchool` /
// `timezoneForSchool`. Stubbed so this suite needs no database.
vi.mock('../src/services/prisma', () => ({ default: {} }))

const { parseSchoolWallClock, parseSchoolExpiry } = await import('../src/services/dateTime')

/**
 * The bug: an `<input type="datetime-local">` sends bare wall-clock text, and
 * `new Date()` resolves it against the SERVER's zone — UTC in production. A
 * Dubai admin scheduling a post for 11:30 stored 11:30Z, so it published at
 * 15:30 local and read back as 15:30 from the moment they saved it.
 */
describe('parseSchoolWallClock', () => {
  it('reads a bare wall clock as the school’s local time, not the server’s', () => {
    // 11:30 in Dubai (UTC+4) is 07:30Z — NOT 11:30Z, which is what the bug did.
    expect(parseSchoolWallClock('2026-09-11T11:30', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T07:30:00.000Z')
  })

  it('honours a value that already carries an offset', () => {
    // A client that did the conversion itself must never be second-guessed.
    expect(parseSchoolWallClock('2026-09-11T07:30:00.000Z', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T07:30:00.000Z')
    expect(parseSchoolWallClock('2026-09-11T11:30:00+04:00', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T07:30:00.000Z')
  })

  it('treats a date with no time as local midnight', () => {
    expect(parseSchoolWallClock('2026-09-11', 'Asia/Dubai').toISOString())
      .toBe('2026-09-10T20:00:00.000Z')
  })

  // DST is why this converts at the given instant rather than by a fixed
  // offset. London is +1 in September and +0 in January.
  it('follows the zone across a DST boundary', () => {
    expect(parseSchoolWallClock('2026-09-11T11:30', 'Europe/London').toISOString())
      .toBe('2026-09-11T10:30:00.000Z')
    expect(parseSchoolWallClock('2026-01-11T11:30', 'Europe/London').toISOString())
      .toBe('2026-01-11T11:30:00.000Z')
  })

  it('falls back to UTC for a school with no usable timezone', () => {
    expect(parseSchoolWallClock('2026-09-11T11:30', 'UTC').toISOString())
      .toBe('2026-09-11T11:30:00.000Z')
    // An invalid zone must not throw — it reads as UTC, the old behaviour.
    expect(parseSchoolWallClock('2026-09-11T11:30', 'Not/AZone').toISOString())
      .toBe('2026-09-11T11:30:00.000Z')
  })

  it('hands back an Invalid Date for text it cannot parse', () => {
    expect(Number.isNaN(parseSchoolWallClock('not a date', 'Asia/Dubai').getTime())).toBe(true)
  })
})

/**
 * "Show until" is a DATE: it names the last day a post is shown, not the second
 * it disappears. Read as plain UTC midnight it meant the START of that day, so
 * in a UTC+4 school a post set to show until the 11th vanished at 4am ON the
 * 11th — a day early.
 */
describe('parseSchoolExpiry', () => {
  it('runs a bare date to the END of that day in the school’s zone', () => {
    // expiresAt is an exclusive bound (`expiresAt > now` keeps it visible), so
    // the end of the 11th IS the moment the 12th begins: 2026-09-11T20:00Z.
    expect(parseSchoolExpiry('2026-09-11', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T20:00:00.000Z')
  })

  it('rolls over a month end correctly', () => {
    expect(parseSchoolExpiry('2026-09-30', 'Asia/Dubai').toISOString())
      .toBe('2026-09-30T20:00:00.000Z')
    expect(parseSchoolExpiry('2026-12-31', 'Asia/Dubai').toISOString())
      .toBe('2026-12-31T20:00:00.000Z')
  })

  it('takes a specific time at face value', () => {
    // Someone who typed a time meant that time — only a bare date is stretched.
    expect(parseSchoolExpiry('2026-09-11T09:00', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T05:00:00.000Z')
    expect(parseSchoolExpiry('2026-09-11T09:00:00.000Z', 'Asia/Dubai').toISOString())
      .toBe('2026-09-11T09:00:00.000Z')
  })

  it('ends the day at UTC midnight for a school with no timezone', () => {
    expect(parseSchoolExpiry('2026-09-11', 'UTC').toISOString())
      .toBe('2026-09-12T00:00:00.000Z')
  })
})
