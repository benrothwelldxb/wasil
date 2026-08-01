/**
 * Small, dependency-free formatting helpers shared across the UI.
 * Kept generic — nothing FPL-specific lives here.
 */

/** Format a number with thousands separators for the given locale. */
export function formatNumber(
  value: number,
  locale = "en-GB",
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Format a number as a signed string, e.g. `+5` / `-3` / `0`. */
export function formatSigned(value: number, locale = "en-GB"): string {
  const formatted = formatNumber(Math.abs(value), locale);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/** Clamp a number into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Truncate a string to `max` characters, appending an ellipsis if needed. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
