/**
 * Timezone-aware "today" and "now" helpers.
 *
 * Multiple routes were using `new Date().toISOString().slice(0, 10)` to mean
 * "today's date", which is UTC. For VHPS in Dubai (UTC+4), the first 4 hours
 * of every local day show yesterday's date — so an attendance lookup at
 * 7am Dubai time returns the previous day's marks. Now that School has a
 * `timezone` field, those routes can ask for "today in this school's
 * timezone" explicitly.
 */

import prisma from './prisma.js'

/**
 * Returns the calendar date in the given IANA timezone as YYYY-MM-DD, plus
 * the current local time as HH:MM. Falls back to UTC if the timezone string
 * is invalid (Intl.DateTimeFormat throws).
 */
export function nowInTimezone(timezone: string): { date: string; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date())
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    const date = `${get('year')}-${get('month')}-${get('day')}`
    const hour = get('hour') === '24' ? '00' : get('hour')
    const time = `${hour}:${get('minute')}`
    return { date, time }
  } catch {
    const now = new Date()
    return {
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
    }
  }
}

/** Convenience: just the date in YYYY-MM-DD for a timezone. */
export function todayInTimezone(timezone: string): string {
  return nowInTimezone(timezone).date
}

/**
 * The offset (ms) of an IANA timezone from UTC *at a given instant* — i.e. how
 * far ahead of UTC the zone's wall clock reads. DST-aware. Returns 0 if the
 * timezone string is invalid.
 */
function tzOffsetMs(instant: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = fmt.formatToParts(instant)
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
    const hour = get('hour') === 24 ? 0 : get('hour')
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
    return asUTC - instant.getTime()
  } catch {
    return 0
  }
}

/**
 * Convert a wall-clock date + time in an IANA timezone to the UTC instant it
 * denotes. e.g. ('2026-09-10', '09:00', 'Asia/Dubai') → the Date for
 * 2026-09-10T05:00:00.000Z. Time defaults to 00:00 when omitted/blank. Used to
 * build Hub `starts_at`/`ends_at` (UTC ISO) from a school-local proposal form.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = (timeStr || '00:00').split(':').map(Number)
  // Guess the instant by treating the wall components as if they were UTC, then
  // correct by the zone's offset at that (approximate) instant.
  const utcGuess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0)
  const offset = tzOffsetMs(new Date(utcGuess), timezone)
  return new Date(utcGuess - offset)
}

/**
 * "Today" in a given school's local timezone, fetching the timezone from the
 * School row. Caches nothing — call once per request and re-use the result.
 */
export async function todayForSchool(schoolId: string): Promise<string> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { timezone: true },
  })
  return todayInTimezone(school?.timezone ?? 'UTC')
}
