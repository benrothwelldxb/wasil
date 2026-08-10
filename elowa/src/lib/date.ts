/**
 * Small date helpers. Dates in the domain layer are stored as ISO date strings
 * (`YYYY-MM-DD`) to stay backend-agnostic and serialisation-safe.
 */

export type IsoDate = string; // `YYYY-MM-DD`

/** Format an ISO date as e.g. "12 March" (day + long month, no year). */
export function formatDayMonth(iso: IsoDate): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Format an ISO date as e.g. "24 Feb 2026". */
export function formatShortDate(iso: IsoDate): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a range as "24 February – 22 May". */
export function formatDateRange(startIso: IsoDate, endIso: IsoDate): string {
  return `${formatDayMonth(startIso)} – ${formatDayMonth(endIso)}`;
}

/** Convert a Date to an ISO date string in local time. */
export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add (or subtract) days to an ISO date. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Greeting keyed to the time of day. */
export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
