/**
 * Wall-clock ↔ instant, for `<input type="datetime-local">`.
 *
 * A datetime-local input speaks bare wall-clock text ("2026-09-11T11:30") with
 * no zone attached, while the API stores and returns an instant (UTC ISO).
 * Converting between the two by string-slicing an ISO — which is what every
 * form here used to do — silently shows UTC: an admin in Dubai who scheduled a
 * post for 11:30 saw it read back as 15:30.
 *
 * Both directions go through the viewer's own zone, so what you type is what
 * you see back. The server reads a bare value as the SCHOOL's local time
 * (parseSchoolWallClock), and honours anything that carries an offset — which
 * is what `toIsoInstant` sends — so the two agree for anyone sitting at the
 * school, and the school's clock still wins for anyone who isn't.
 */

/** An instant (UTC ISO) → the value a datetime-local input wants, in the
 *  viewer's zone. Empty string for null/undefined/unparseable. */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value → a UTC ISO instant, read in the viewer's zone.
 *  Undefined for an empty value, so callers can omit the field entirely. */
export function toIsoInstant(localValue: string | null | undefined): string | undefined {
  if (!localValue) return undefined
  const d = new Date(localValue)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
