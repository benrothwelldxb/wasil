/**
 * Turns raw, user-facing "importance" sliders into a valid `JourneyScoreWeights`
 * (always sums to 1). See ALGORITHM.md §"User-adjustable weighting".
 */
import { DEFAULT_JOURNEY_SCORE_WEIGHTS, JOURNEY_SCORE_FACTORS } from './types';
import type { JourneyScoreFactorKey, JourneyScoreWeights } from './types';

/**
 * Clamps negative/invalid importances to 0, treats missing keys as 0, and
 * normalises so the result always sums to 1. An empty preference (all-zero,
 * or nothing supplied) is not a valid preference, so it falls back to
 * `DEFAULT_JOURNEY_SCORE_WEIGHTS`.
 */
export function normalizeWeights(
  raw: Partial<Record<JourneyScoreFactorKey, number>>,
): JourneyScoreWeights {
  const clamped = {} as Record<JourneyScoreFactorKey, number>;
  let total = 0;

  for (const key of JOURNEY_SCORE_FACTORS) {
    const value = raw[key];
    const safe = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    clamped[key] = safe;
    total += safe;
  }

  if (total === 0) {
    return { ...DEFAULT_JOURNEY_SCORE_WEIGHTS };
  }

  const result = {} as JourneyScoreWeights;
  for (const key of JOURNEY_SCORE_FACTORS) {
    result[key] = clamped[key] / total;
  }
  return result;
}
