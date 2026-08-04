/**
 * Combines the twelve factor sub-scores into the composite Journey Score:
 * null-redistribution over present factors, then a normalised weighted mean.
 * See ALGORITHM.md §"Composite" and §"Explainability".
 */
import { JOURNEY_SCORE_FACTOR_LABELS, JOURNEY_SCORE_FACTORS } from './types';
import type {
  JourneyScore,
  JourneyScoreContribution,
  JourneyScoreFactors,
  JourneyScoreWeights,
} from './types';
import { clamp } from '@/domain/math';

/** Restrict + renormalise `weights` to the factors that are actually present. */
function computeEffectiveWeights(
  factors: JourneyScoreFactors,
  weights: JourneyScoreWeights,
): JourneyScoreWeights {
  const effective = {} as JourneyScoreWeights;
  for (const key of JOURNEY_SCORE_FACTORS) {
    effective[key] = 0;
  }

  const presentKeys = JOURNEY_SCORE_FACTORS.filter((key) => factors[key] !== null);
  if (presentKeys.length === 0) return effective;

  const presentWeightSum = presentKeys.reduce(
    (sum, key) => sum + Math.max(0, weights[key]),
    0,
  );

  if (presentWeightSum > 0) {
    for (const key of presentKeys) {
      effective[key] = Math.max(0, weights[key]) / presentWeightSum;
    }
  } else {
    const equalShare = 1 / presentKeys.length;
    for (const key of presentKeys) {
      effective[key] = equalShare;
    }
  }

  return effective;
}

function buildNarrative(contributions: JourneyScoreContribution[], total: number): string {
  const present = contributions.filter((c) => c.value !== null);
  if (present.length === 0) {
    return `Scores ${total} — no factors available.`;
  }

  const top = present.slice(0, 2);
  const labels = top.map((c) => JOURNEY_SCORE_FACTOR_LABELS[c.factor]);
  const named = labels.length === 1 ? labels[0] : `${labels[0]} and ${labels[1]}`;
  return `Scores ${total}, led by ${named}.`;
}

export function computeJourneyScore(
  factors: JourneyScoreFactors,
  weights: JourneyScoreWeights,
): JourneyScore {
  const effectiveWeights = computeEffectiveWeights(factors, weights);

  let rawTotal = 0;
  const contributions: JourneyScoreContribution[] = JOURNEY_SCORE_FACTORS.map((key) => {
    const value = factors[key];
    const weight = effectiveWeights[key];
    const contribution = value === null ? 0 : value * weight;
    rawTotal += contribution;
    return { factor: key, value, weight, contribution };
  });

  // Array.prototype.sort is a stable sort (ES2019+), so ties keep the
  // original JOURNEY_SCORE_FACTORS order.
  contributions.sort((a, b) => b.contribution - a.contribution);

  const total = clamp(Math.round(rawTotal));

  return {
    total,
    factors,
    effectiveWeights,
    contributions,
    narrative: buildNarrative(contributions, total),
  };
}
