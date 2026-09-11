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

/** Does this string already pin itself to an instant — a trailing `Z`, or a
 *  `+04:00` / `-05:00` offset after the time? */
function carriesOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim())
}

/**
 * Parse a datetime a human typed into a form, in the school's timezone.
 *
 * An `<input type="datetime-local">` sends bare wall-clock text —
 * "2026-09-11T11:30", with nothing saying which 11:30 it means. `new Date()`
 * resolves that against the SERVER's zone, which in production is UTC: an
 * admin in Dubai scheduling a post for 11:30 stored 11:30Z and the post went
 * out at 15:30 their time, four hours late, having displayed as 15:30 ever
 * since they saved it.
 *
 * The school's own timezone is the right reading of a wall clock typed by
 * someone at that school, and it is the same authority attendance, digests and
 * event proposals already use. A value that DOES carry an offset (or a `Z`) is
 * already an instant and is honoured exactly as sent — so a client that does
 * the conversion itself, like the admin app now does, is never second-guessed,
 * and neither is a partner caller sending proper ISO.
 *
 * A date with no time at all ("2026-09-11") means midnight that day, locally.
 * Unparseable text comes back as an Invalid Date, exactly as `new Date()` would
 * — the caller decides what to do with it. Callers skip blank values.
 */
export function parseSchoolWallClock(value: string, timezone: string): Date {
  const trimmed = value.trim()
  if (carriesOffset(trimmed)) return new Date(trimmed)
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(trimmed)
  if (!m) return new Date(trimmed)
  return zonedTimeToUtc(m[1], m[2] ?? '00:00', timezone)
}

/**
 * The instant a "show until <date>" expiry falls due: the END of that day in the
 * school's timezone.
 *
 * `expiresAt` is an exclusive bound everywhere it is read (`expiresAt > now`
 * keeps a post visible), so the end of the 11th is precisely the moment the
 * 12th begins locally — no 23:59:59.999 fencepost, and no gap.
 *
 * "Show until" is a DATE input: it says which day is the last one, not which
 * second. Read as plain UTC midnight it meant the START of that day, and in a
 * UTC+4 school a post set to show until the 11th vanished at 4am ON the 11th —
 * a day early, from the school's point of view.
 *
 * A value that carries a TIME (or an offset) is somebody being specific, and is
 * taken at face value: only a bare date is stretched to the day's end.
 */
export function parseSchoolExpiry(value: string, timezone: string): Date {
  const trimmed = value.trim()
  if (carriesOffset(trimmed)) return new Date(trimmed)
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(trimmed)
  if (!m) return new Date(trimmed)
  if (m[2]) return zonedTimeToUtc(m[1], m[2], timezone)
  const [y, mo, d] = m[1].split('-').map(Number)
  const next = new Date(Date.UTC(y, mo - 1, d + 1))
  return zonedTimeToUtc(next.toISOString().slice(0, 10), '00:00', timezone)
}

/** `parseSchoolExpiry`, looking the timezone up from the School row. Shares the
 *  offset short-circuit with `parseWallClockForSchool`: an instant costs no
 *  query, because it needs no zone. */
export async function parseExpiryForSchool(value: string, schoolId: string): Promise<Date> {
  if (carriesOffset(value)) return new Date(value.trim())
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { timezone: true },
  })
  return parseSchoolExpiry(value, school?.timezone || 'UTC')
}

/**
 * `parseSchoolWallClock`, looking the timezone up from the School row.
 *
 * A value that already carries an offset needs no zone at all, so it never
 * costs a query — which is every well-formed API client, and the admin app
 * since it started sending instants. Falls back to UTC when the school has no
 * timezone set: the behaviour before any of this existed, so nobody is worse
 * off than they were.
 */
export async function parseWallClockForSchool(value: string, schoolId: string): Promise<Date> {
  if (carriesOffset(value)) return new Date(value.trim())
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { timezone: true },
  })
  return parseSchoolWallClock(value, school?.timezone || 'UTC')
}
