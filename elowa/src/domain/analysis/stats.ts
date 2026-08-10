/**
 * Small, dependency-free statistics helpers used across the analysis engines.
 * Everything here is pure and deterministic.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

/** Round to one decimal place (avoids presenting false precision). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The last `n` items of an array (or all of them). */
export function lastN<T>(items: readonly T[], n: number): T[] {
  return n >= items.length ? [...items] : items.slice(items.length - n);
}
