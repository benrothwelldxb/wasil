/**
 * Shared pure numeric helpers used across the scoring/derivation layers
 * (`domain/scoring`, `domain/journey-score`, `data/journey-score`,
 * `data/hotels`). Previously duplicated byte-for-byte in six places; this is
 * now the single source of truth. No behaviour change versus any of the
 * former local copies — see each module's git history for the prior inline
 * definitions.
 */

/**
 * Clamps `n` into the inclusive range `[min, max]`. Defaults to the 0–100
 * score range used throughout the scoring domain; pass explicit bounds for
 * other ranges (e.g. star ratings, percentages as 0–1).
 */
export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

/** Clamps `n` into the inclusive unit range `[0, 1]`. */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Arithmetic mean of `values`, or `null` for an empty array (there is no
 * meaningful average of zero samples, and `null` composes with the
 * "missing signal" convention used by the Journey Score factor derivations).
 */
export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}
