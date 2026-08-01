const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Human "time remaining" for a deadline countdown. Returns null once the
 * deadline has passed. Compact by design: days+hours far out, hours+minutes
 * within a day, minutes within the hour.
 */
export function formatCountdown(msRemaining: number): string | null {
  if (msRemaining <= 0) return null;
  const days = Math.floor(msRemaining / DAY);
  const hours = Math.floor((msRemaining % DAY) / HOUR);
  const mins = Math.floor((msRemaining % HOUR) / MINUTE);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}
