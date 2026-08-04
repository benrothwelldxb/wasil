/**
 * Experience scoring, ranking, badge assignment, and post-hoc hotel swapping.
 *
 * Public API (imported by the data provider and the UI):
 *   - scoreJourney(journey, ctx)          → ExperienceScore
 *   - rankJourneys(journeys, criteria)    → Journey[] (scored + badged + sorted)
 *   - applyBudgetConstraint(...)          → re-exported from ./constraints
 *   - applyHotelChoice(journey, hotelId)  → Journey (recomputed cost + score)
 */
import type {
  ExperienceFactorKey,
  ExperienceFactors,
  ExperienceScore,
  Journey,
  SearchCriteria,
  StopoverCity,
} from '../types';
import { computeCostBreakdown } from './cost';
import { comfort, computeFactors, valueForMoney, type FactorContext } from './normalize';
import { effectiveWeights, type FactorWeights } from './weights';

export { applyBudgetConstraint, isFeasible } from './constraints';
export type { BudgetFilterResult } from './constraints';
export { computeCostBreakdown } from './cost';
export { effectiveWeights } from './weights';

const FACTOR_LABELS: Record<ExperienceFactorKey, string> = {
  stopoverAppeal: 'the stopover experience',
  comfort: 'onboard comfort',
  travelTimeEfficiency: 'a quick, direct routing',
  layoverQuality: 'smooth connections',
  valueForMoney: 'strong value against your budget',
  scheduleConvenience: 'civilised departure and arrival times',
};

const weightedTotal = (factors: ExperienceFactors, weights: FactorWeights): number => {
  let total = 0;
  (Object.keys(weights) as ExperienceFactorKey[]).forEach((k) => {
    total += factors[k] * weights[k];
  });
  return Math.round(total);
};

const buildNarrative = (
  journey: Journey,
  factors: ExperienceFactors,
  weights: FactorWeights,
): string => {
  // The factor contributing most to the composite is the story.
  const ranked = (Object.keys(weights) as ExperienceFactorKey[])
    .map((k) => ({ key: k, contribution: factors[k] * weights[k] }))
    .sort((a, b) => b.contribution - a.contribution);

  const lead = FACTOR_LABELS[ranked[0].key];
  if (journey.kind === 'stopover' && journey.stopovers[0]) {
    return `Ranks here for ${lead}, anchored by a ${journey.stopovers[0].nights}-night ${journey.stopovers[0].cityName} stopover.`;
  }
  return `A direct routing that ranks here for ${lead}.`;
};

export interface ScoringContext extends FactorContext {
  weights: FactorWeights;
}

export function scoreJourney(journey: Journey, ctx: ScoringContext): ExperienceScore {
  const factors = computeFactors(journey, ctx);
  return {
    total: weightedTotal(factors, ctx.weights),
    factors,
    weights: ctx.weights,
    narrative: buildNarrative(journey, factors, ctx.weights),
  };
}

const compareJourneys = (a: Journey, b: Journey): number => {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  if (b.score.factors.valueForMoney !== a.score.factors.valueForMoney)
    return b.score.factors.valueForMoney - a.score.factors.valueForMoney;
  if (a.totalTravelTimeMinutes !== b.totalTravelTimeMinutes)
    return a.totalTravelTimeMinutes - b.totalTravelTimeMinutes;
  return a.id.localeCompare(b.id);
};

const assignBadges = (ranked: Journey[]): void => {
  if (ranked.length === 0) return;

  ranked.forEach((j) => (j.badges = []));

  // best-experience → rank 1
  ranked[0].badges.push('best-experience');

  // fastest → minimum travel time
  const fastest = ranked.reduce((m, j) =>
    j.totalTravelTimeMinutes < m.totalTravelTimeMinutes ? j : m,
  );
  if (!fastest.badges.includes('fastest')) fastest.badges.push('fastest');

  // best-value → maximum headroom
  const bestValue = ranked.reduce((m, j) =>
    j.cost.headroom.amount > m.cost.headroom.amount ? j : m,
  );
  if (!bestValue.badges.includes('best-value')) bestValue.badges.push('best-value');

  // hidden-gem → highest-scoring journey with score ≥ 70 whose total cost sits
  // in the cheapest tercile of the result set.
  const sortedByCost = [...ranked].sort((a, b) => a.cost.total.amount - b.cost.total.amount);
  const tercileIndex = Math.max(0, Math.ceil(sortedByCost.length / 3) - 1);
  const tercileCeiling = sortedByCost[tercileIndex].cost.total.amount;
  const gem = ranked.find(
    (j) => j.score.total >= 70 && j.cost.total.amount <= tercileCeiling && j.badges.length === 0,
  );
  if (gem) gem.badges.push('hidden-gem');
};

/**
 * Scores every journey against the shared result-set context (fastest time,
 * preference-weighted factors), assigns badges, and returns them sorted by
 * experience, best first. Journeys are mutated in place and also returned.
 */
export function rankJourneys(journeys: Journey[], criteria: SearchCriteria): Journey[] {
  if (journeys.length === 0) return [];

  const fastestTravelTimeMinutes = journeys.reduce(
    (min, j) => Math.min(min, j.totalTravelTimeMinutes),
    Infinity,
  );
  const weights = effectiveWeights(criteria.preferences);
  const ctx: ScoringContext = { criteria, fastestTravelTimeMinutes, weights };

  for (const journey of journeys) {
    journey.score = scoreJourney(journey, ctx);
  }

  const ranked = [...journeys].sort(compareJourneys);
  assignBadges(ranked);
  return ranked;
}

/**
 * Swap the selected hotel of the stopover that owns `hotelId`, recomputing the
 * cost breakdown and the hotel-sensitive factors. Set-relative factors
 * (travel-time efficiency) and badges are preserved.
 */
export function applyHotelChoice(journey: Journey, hotelId: string): Journey {
  const targetIndex = journey.stopovers.findIndex(
    (s) => s.hotel.id === hotelId || s.alternativeHotels.some((h) => h.id === hotelId),
  );
  if (targetIndex === -1) return journey;

  const stopover = journey.stopovers[targetIndex];
  if (stopover.hotel.id === hotelId) return journey;

  const chosen = stopover.alternativeHotels.find((h) => h.id === hotelId);
  if (!chosen) return journey;

  const previous = stopover.hotel;
  const newStopover: StopoverCity = {
    ...stopover,
    hotel: chosen,
    alternativeHotels: [
      previous,
      ...stopover.alternativeHotels.filter((h) => h.id !== hotelId),
    ],
  };
  const stopovers = journey.stopovers.map((s, i) => (i === targetIndex ? newStopover : s));

  const cost = computeCostBreakdown({
    legs: journey.legs,
    stopovers,
    pax: journey.criteria.pax,
    budget: journey.criteria.budget,
  });

  const updated: Journey = { ...journey, stopovers, cost };

  // Recompute only the hotel-sensitive factors; keep the rest from the set score.
  const factors: ExperienceFactors = {
    ...journey.score.factors,
    comfort: comfort(updated),
    valueForMoney: valueForMoney(cost.headroomPct),
  };
  updated.score = {
    ...journey.score,
    factors,
    total: weightedTotal(factors, journey.score.weights),
  };

  return updated;
}
