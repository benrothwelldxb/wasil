import { describe, it, expect } from 'vitest'
import { describeWhenForSchool } from '../src/services/dateTime'

/**
 * "Booking opens at 18:00" was the same sentence whether the wave opened in ten
 * minutes or on Thursday.
 *
 * Read at breakfast, a bare time means this evening to everybody. A parent
 * whose wave is two days off came back that night, found the same grid they
 * could not book from, and had no reason to conclude anything except that it
 * was broken. The refusal message had the same fault and was worse — it said
 * "shortly" regardless, which is a claim rather than an omission.
 *
 * Said in the SCHOOL's timezone, because a message a school sends means the
 * school's clock even when the parent is reading it from another country.
 */

const DUBAI = 'Asia/Dubai'

describe('describeWhenForSchool', () => {
  it('says today, with the school\'s clock', () => {
    // 14:00 UTC is 18:00 in Dubai, on the same day.
    const now = new Date('2026-09-23T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-09-23T14:00:00.000Z'), DUBAI, now)).toBe('today at 18:00')
  })

  it('says tomorrow', () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-09-24T14:00:00.000Z'), DUBAI, now)).toBe('tomorrow at 18:00')
  })

  it('names the day and date further out — the case this exists for', () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-09-25T14:00:00.000Z'), DUBAI, now)).toBe(
      'on Friday 25 September at 18:00',
    )
  })

  it('uses the school\'s day boundary, not the server\'s', () => {
    // 21:00 UTC on the 23rd is 01:00 on the 24th in Dubai. A school reading
    // this at 01:00 is in a new day; a UTC server is not.
    const now = new Date('2026-09-23T21:00:00.000Z')
    // Opening later that same Dubai day — the 24th — must read as "today".
    expect(describeWhenForSchool(new Date('2026-09-24T14:00:00.000Z'), DUBAI, now)).toBe('today at 18:00')
  })

  it('crosses a month end without arithmetic on instants', () => {
    const now = new Date('2026-09-30T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-10-01T14:00:00.000Z'), DUBAI, now)).toBe('tomorrow at 18:00')
  })

  it('crosses a year end', () => {
    const now = new Date('2026-12-31T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2027-01-01T14:00:00.000Z'), DUBAI, now)).toBe('tomorrow at 18:00')
  })

  it('works for a school genuinely on UTC', () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-09-23T18:00:00.000Z'), 'UTC', now)).toBe('today at 18:00')
  })

  it('falls back to UTC rather than throwing on a missing timezone', () => {
    const now = new Date('2026-09-23T06:00:00.000Z')
    expect(describeWhenForSchool(new Date('2026-09-23T18:00:00.000Z'), '', now)).toBe('today at 18:00')
  })
})
