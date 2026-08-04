/**
 * Stopover discovery orchestrator — ALGORITHM.md §3–§5.
 *
 * Pure(-ish): the only external I/O is through the injected `DiscoveryDeps`
 * ports (recommender, flight search, hotel estimator). No dataset, React, or
 * wall-clock reads. Given the same deps and request, the result is
 * deterministic.
 */
import type {
  ExperienceFactors,
  ExperienceScore,
  ISODateString,
  ISODateTimeString,
  Journey,
  Leg,
  SearchCriteria,
  StopoverCity,
} from '@/domain/types';
import {
  applyBudgetConstraint,
  computeCostBreakdown,
  isFeasible,
  MIN_CONNECTION_MINUTES,
  rankJourneys,
  totalHeads,
} from '@/domain/scoring';
import type { CandidateCity, DiscoveryDeps, DiscoveryRequest, DiscoveryResult } from './types';
import { RECOMMEND_LIMIT } from './types';

const MS_PER_DAY = 86_400_000;
const MS_PER_MIN = 60_000;

/** Add whole days to a `YYYY-MM-DD` date string, returning `YYYY-MM-DD`. Pure — no wall clock. */
function addDays(dateStr: ISODateString, days: number): ISODateString {
  const base = Date.parse(`${dateStr}T00:00:00.000Z`);
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole minutes between two ISO timestamps. */
function minutesBetween(fromIso: ISODateTimeString, toIso: ISODateTimeString): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_MIN);
}

/** Cheapest leg by per-pax price; the engine — not the port — picks the fare. */
function cheapestLeg(legs: readonly Leg[]): Leg {
  return legs.reduce((min, leg) => (leg.pricePerPax.amount < min.pricePerPax.amount ? leg : min));
}

/**
 * Cheapest outbound leg that can actually connect — departing no earlier than
 * the inbound arrival plus the minimum connection buffer. Without this, the
 * cheapest fare (often a red-eye) can depart before the inbound lands, and the
 * whole candidate is then silently discarded by `isFeasible`. Falls back to the
 * plain cheapest only when nothing connects (which `isFeasible` then drops, as
 * before) so behaviour never regresses.
 */
function cheapestConnectingLeg(legs: readonly Leg[], earliestDepartureMs: number): Leg {
  const connecting = legs.filter((leg) => Date.parse(leg.departure) >= earliestDepartureMs);
  return cheapestLeg(connecting.length > 0 ? connecting : legs);
}

const ZERO_FACTORS: ExperienceFactors = {
  stopoverAppeal: 0,
  comfort: 0,
  travelTimeEfficiency: 0,
  layoverQuality: 0,
  valueForMoney: 0,
  scheduleConvenience: 0,
};

/**
 * Placeholder score assigned at construction time; `rankJourneys` overwrites
 * it for every journey that survives the feasibility/budget filter (the only
 * journeys the caller ever sees), so this value is never observed downstream.
 */
const PLACEHOLDER_SCORE: ExperienceScore = {
  total: 0,
  factors: ZERO_FACTORS,
  weights: { ...ZERO_FACTORS },
  narrative: '',
};

function buildCriteria(request: DiscoveryRequest): SearchCriteria {
  return {
    origin: request.origin,
    destination: request.destination,
    departureDate: request.departureDate,
    pax: request.pax,
    budget: request.budget,
    cabin: request.cabin,
    preferences: request.preferences,
    maxStopovers: request.maxStopovers,
    minStopoverNights: 1,
    maxStopoverNights: request.maxStopoverNights,
  };
}

function buildStopoverCity(
  city: CandidateCity,
  nights: number,
  hotelResult: Awaited<ReturnType<DiscoveryDeps['hotelEstimator']['estimate']>>,
): StopoverCity {
  return {
    airport: { iata: city.iata, cityName: city.cityName, countryCode: city.countryCode },
    cityName: city.cityName,
    countryCode: city.countryCode,
    nights,
    appealScore: city.appealScore,
    tags: city.tags,
    headline: city.headline,
    highlights: city.highlights,
    ...(city.visaNote !== undefined ? { visaNote: city.visaNote } : {}),
    hotel: hotelResult.hotel,
    alternativeHotels: hotelResult.alternativeHotels,
    transfers: hotelResult.transfers,
  };
}

interface DiscoveryOpts {
  signal?: AbortSignal;
}

/**
 * Runs the full pipeline: recommend → per-candidate construction → feasibility
 * + budget filter → rank. Also constructs the direct (no-stopover) baseline so
 * the ranked output can answer "is a stopover better than flying direct?".
 */
export async function discoverStopoverJourneys(
  request: DiscoveryRequest,
  deps: DiscoveryDeps,
  opts?: DiscoveryOpts,
): Promise<DiscoveryResult> {
  // maxStopovers === 0 means "direct only": skip candidate discovery entirely
  // and return just the direct baseline built below.
  const recs =
    request.maxStopovers === 0 ? [] : await deps.recommender.recommend(request, deps.cityPool);
  const criteria = buildCriteria(request);
  const rooms = Math.ceil(totalHeads(request.pax) / 2);

  const stopoverJourneys: Journey[] = [];

  // Defensive bound: a well-behaved recommender already shortlists to
  // RECOMMEND_LIMIT, but a future AI recommender might return more — never pay
  // for unbounded full construction.
  const boundedRecs = recs.slice(0, RECOMMEND_LIMIT);

  for (const rec of boundedRecs) {
    const city = rec.city;
    // Clamp nights to the traveller's allowed range — the heuristic already
    // respects it; this guards an AI recommender proposing out-of-range nights.
    const nights = Math.min(request.maxStopoverNights, Math.max(1, Math.round(rec.nights)));

    const inboundLegs = await deps.flightSearch.search(
      { from: request.origin, to: city.iata, date: request.departureDate, cabin: request.cabin, pax: request.pax },
      opts,
    );
    if (inboundLegs.length === 0) continue;
    const inbound = cheapestLeg(inboundLegs);

    const outboundDate = addDays(request.departureDate, nights);
    const outboundLegs = await deps.flightSearch.search(
      { from: city.iata, to: request.destination, date: outboundDate, cabin: request.cabin, pax: request.pax },
      opts,
    );
    if (outboundLegs.length === 0) continue;
    const earliestOutboundMs = Date.parse(inbound.arrival) + MIN_CONNECTION_MINUTES * MS_PER_MIN;
    const outbound = cheapestConnectingLeg(outboundLegs, earliestOutboundMs);

    const hotelResult = await deps.hotelEstimator.estimate(
      { city, nights, rooms, date: request.departureDate },
      opts,
    );

    const stopover = buildStopoverCity(city, nights, hotelResult);
    const legs = [inbound, outbound];
    // Wire/estimate totals are never trusted — cost is recomputed from the
    // constructed legs and hotel, per ALGORITHM.md §3.
    const cost = computeCostBreakdown({ legs, stopovers: [stopover], pax: request.pax, budget: request.budget });

    const journey: Journey = {
      id: `stopover-${city.iata}-${nights}`,
      kind: 'stopover',
      criteria,
      legs,
      stopovers: [stopover],
      totalTravelTimeMinutes: inbound.durationMinutes + outbound.durationMinutes,
      doorToDoorMinutes: minutesBetween(inbound.departure, outbound.arrival),
      cost,
      score: PLACEHOLDER_SCORE,
      badges: [],
    };
    stopoverJourneys.push(journey);
  }

  const directLegs = await deps.flightSearch.search(
    {
      from: request.origin,
      to: request.destination,
      date: request.departureDate,
      cabin: request.cabin,
      pax: request.pax,
    },
    opts,
  );

  const candidates: Journey[] = [...stopoverJourneys];
  if (directLegs.length > 0) {
    const direct = cheapestLeg(directLegs);
    const cost = computeCostBreakdown({
      legs: [direct],
      stopovers: [],
      pax: request.pax,
      budget: request.budget,
    });
    candidates.push({
      id: 'direct',
      kind: 'direct',
      criteria,
      legs: [direct],
      stopovers: [],
      totalTravelTimeMinutes: direct.durationMinutes,
      doorToDoorMinutes: minutesBetween(direct.departure, direct.arrival),
      cost,
      score: PLACEHOLDER_SCORE,
      badges: [],
    });
  }

  const feasible = candidates.filter(isFeasible);
  const { kept, overBudgetFiltered, cheapestOverBudget } = applyBudgetConstraint(feasible, criteria);
  const ranked = rankJourneys(kept, criteria);

  return {
    request,
    journeys: ranked,
    diagnostics: {
      citiesConsidered: deps.cityPool.length,
      gated: recs.length,
      shortlisted: stopoverJourneys.length,
      overBudgetFiltered,
      ...(cheapestOverBudget ? { cheapestOverBudget } : {}),
      recommenderId: deps.recommender.id,
    },
  };
}
