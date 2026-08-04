/**
 * Heuristic candidate recommender — the default `CandidateRecommender`.
 *
 * Implements ALGORITHM.md §1 (candidate scoring), §1b (nights optimisation),
 * and §2 (budget-aware shortlist). Pure: no I/O, no randomness, no clock reads.
 * An AI recommender can later implement the same `CandidateRecommender`
 * interface and feed the identical §2–§5 verification pipeline unchanged.
 */
import type { CabinClass, Money, Pax, TravelPreference } from '@/domain/types';
import { clamp, farePax, money, totalHeads } from '@/domain/scoring';
import { haversineKm } from '@/domain/geo';
import {
  BUDGET_SWEET_SPOT,
  CANDIDATE_WEIGHTS,
  MAX_DETOUR,
  NIGHTS_FACTOR,
  RECOMMEND_LIMIT,
} from './types';
import type {
  CandidateCity,
  CandidateRecommender,
  DiscoveryRequest,
  StopoverRecommendation,
} from './types';

// ——— cheap closed-form cost estimate (ALGORITHM.md §2) ———
//
// Mirrors the shape of the real fare model (`src/data/synthetic/pricing.ts`)
// but is intentionally independent of it: this module must stay free of any
// `src/data/**` import so an AI recommender (or a future dataset) can reuse
// it without pulling in the synthetic generator.
const FARE_PER_KM = 0.11;
const BASE_FARE_PER_LEG = 45;
const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  economy: 1,
  premium_economy: 1.7,
  business: 2.9,
};

/**
 * Approximate leg distance used only when the origin or destination airport
 * is missing from the injected city pool, which the data layer guarantees
 * does not happen in production (it always seeds O/D into the pool). Kept as
 * a documented, deterministic fallback rather than gating every candidate
 * out just because one distance is unknown — see the detour-handling note in
 * `scoreCandidate` below.
 */
const FALLBACK_LEG_KM = 3000;

function legFareEstimate(km: number, cabin: CabinClass): number {
  return (BASE_FARE_PER_LEG + FARE_PER_KM * km) * CABIN_MULTIPLIER[cabin];
}

/** Cheap two-leg flight cost estimate for O → X → D, all pax. */
function estFlightsTotal(kmOX: number, kmXD: number, cabin: CabinClass, pax: Pax): number {
  const fpax = farePax(pax);
  return (legFareEstimate(kmOX, cabin) + legFareEstimate(kmXD, cabin)) * fpax;
}

/** Cheap hotel cost estimate for a stopover of `nights` nights. */
function estHotelTotal(city: CandidateCity, nights: number, pax: Pax): number {
  const rooms = Math.ceil(totalHeads(pax) / 2);
  return city.hotelBaseNightly.amount * rooms * nights;
}

/** `budgetFit` piecewise reward curve — ALGORITHM.md §1. */
function budgetFitScore(estFrac: number): number {
  const { lo, hi } = BUDGET_SWEET_SPOT;
  if (estFrac > 1) return 0; // defensive; callers gate this out before scoring
  if (estFrac >= lo && estFrac <= hi) return 1;
  if (estFrac < lo) return 0.6 + 0.4 * (estFrac / lo);
  return 1 - ((estFrac - hi) / (1 - hi)) * 0.5;
}

interface NightsChoice {
  nights: number;
  estimatedTotal: number;
}

/**
 * n* = argmax nightsValue(n) subject to estimatedTotal(n) ≤ budget, falling
 * back to the largest feasible n, else 1 (ALGORITHM.md §1b). Callers only
 * invoke this after confirming n=1 is affordable, so the feasible set here is
 * always non-empty in practice; the final fallback exists purely for
 * defensiveness.
 */
function optimalNights(
  city: CandidateCity,
  pax: Pax,
  maxStopoverNights: number,
  flightsTotal: number,
  budgetAmount: number,
): NightsChoice {
  let bestValue: { n: number; value: number; total: number } | undefined;
  let largestFeasible: { n: number; total: number } | undefined;

  for (let n = 1; n <= maxStopoverNights; n++) {
    const total = flightsTotal + estHotelTotal(city, n, pax);
    if (total > budgetAmount) continue;
    const value = city.appealScore * (NIGHTS_FACTOR[n] ?? 0.9);
    if (!bestValue || value > bestValue.value) bestValue = { n, value, total };
    if (!largestFeasible || n > largestFeasible.n) largestFeasible = { n, total };
  }

  if (bestValue) return { nights: bestValue.n, estimatedTotal: bestValue.total };
  if (largestFeasible) return { nights: largestFeasible.n, estimatedTotal: largestFeasible.total };
  return { nights: 1, estimatedTotal: flightsTotal + estHotelTotal(city, 1, pax) };
}

export interface ScoredCandidate {
  score: number;
  nights: number;
  estimatedTotal: Money;
}

/**
 * Scores a single candidate city against the request, or returns `null` if
 * it is hard-gated (too far off-path, is the origin/destination, or is
 * unaffordable even at one night). `cityPool` is used solely to resolve the
 * origin/destination coordinates — `DiscoveryRequest` only carries their
 * IATA codes.
 *
 * Contract note: origin/destination coordinates are NOT in `DiscoveryRequest`
 * itself (only IATA codes are). If either endpoint is absent from
 * `cityPool` — which should not happen once the data layer wires in the real
 * pool, but is handled defensively here — detour cannot be computed. Rather
 * than gating every candidate out in that case, `routeEfficiency` is set to a
 * neutral 0.5 and the missing leg distance(s) fall back to
 * `FALLBACK_LEG_KM` so the rest of the scoring (appeal, hub, budget fit)
 * still functions.
 */
export function scoreCandidate(
  request: DiscoveryRequest,
  city: CandidateCity,
  cityPool: readonly CandidateCity[],
): ScoredCandidate | null {
  if (city.iata === request.origin || city.iata === request.destination) return null;

  const originCity = cityPool.find((c) => c.iata === request.origin);
  const destCity = cityPool.find((c) => c.iata === request.destination);

  let detour: number | undefined;
  if (originCity && destCity) {
    const direct = haversineKm(originCity, destCity);
    if (direct > 0) {
      detour = (haversineKm(originCity, city) + haversineKm(city, destCity)) / direct;
    }
  }
  if (detour !== undefined && detour > MAX_DETOUR) return null;

  const kmOX = originCity ? haversineKm(originCity, city) : FALLBACK_LEG_KM;
  const kmXD = destCity ? haversineKm(city, destCity) : FALLBACK_LEG_KM;
  const flightsTotal = estFlightsTotal(kmOX, kmXD, request.cabin, request.pax);

  const budgetAmount = request.budget.amount;
  const hotelAt1Night = estHotelTotal(city, 1, request.pax);
  if (flightsTotal + hotelAt1Night > budgetAmount) return null;

  const { nights, estimatedTotal } = optimalNights(
    city,
    request.pax,
    request.maxStopoverNights,
    flightsTotal,
    budgetAmount,
  );

  const routeEfficiency =
    detour !== undefined ? clamp((MAX_DETOUR - detour) / (MAX_DETOUR - 1), 0, 1) : 0.5;
  const hubViability = clamp(city.hubStrength / 5, 0, 1);
  const appeal = clamp(city.appealScore / 100, 0, 1);
  const estFrac = estimatedTotal / budgetAmount;
  const budgetFit = budgetFitScore(estFrac);

  const weighted =
    CANDIDATE_WEIGHTS.routeEfficiency * routeEfficiency +
    CANDIDATE_WEIGHTS.hubViability * hubViability +
    CANDIDATE_WEIGHTS.appeal * appeal +
    CANDIDATE_WEIGHTS.budgetFit * budgetFit;

  const matches = city.tags.filter((tag: TravelPreference) =>
    request.preferences.includes(tag),
  ).length;
  const preferenceBoost = 1 + 0.15 * Math.min(2, matches);

  const score = clamp(weighted * preferenceBoost, 0, 1);

  return { score, nights, estimatedTotal: money(estimatedTotal) };
}

function compareRecommendations(a: StopoverRecommendation, b: StopoverRecommendation): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.city.iata.localeCompare(b.city.iata);
}

export class HeuristicCandidateRecommender implements CandidateRecommender {
  readonly id = 'heuristic-v1';

  async recommend(
    request: DiscoveryRequest,
    cityPool: readonly CandidateCity[],
  ): Promise<StopoverRecommendation[]> {
    const scored: StopoverRecommendation[] = [];

    for (const city of cityPool) {
      if (city.iata === request.origin || city.iata === request.destination) continue;
      const result = scoreCandidate(request, city, cityPool);
      if (!result) continue;
      scored.push({
        city,
        nights: result.nights,
        score: result.score,
        estimatedTotal: result.estimatedTotal,
        source: 'heuristic',
      });
    }

    scored.sort(compareRecommendations);
    return scored.slice(0, RECOMMEND_LIMIT);
  }
}

export const heuristicRecommender = new HeuristicCandidateRecommender();
