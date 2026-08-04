/**
 * The synthetic journey engine.
 *
 * `generateSearchResult` is the PURE core: given a `SearchCriteria` it deploys a
 * deterministic pipeline (validate → direct variants → ranked stopover
 * candidates → enrich → cost → feasibility → budget → rank) and returns a fully
 * validated `SearchResult`. It never touches the wall clock or `Math.random`.
 *
 * `SyntheticJourneyProvider` wraps that core behind the `JourneyProvider`
 * interface, adding only a seeded artificial latency so the UI can exercise its
 * loading states.
 */
import type {
  Journey,
  JourneyKind,
  Leg,
  SearchCriteria,
  SearchResult,
  StopoverCity,
} from '@/domain/types';
import { detourRatio, haversineKm } from '@/domain/geo';
import { searchCriteriaSchema, searchResultSchema } from '@/domain/schemas';
import {
  applyBudgetConstraint,
  computeCostBreakdown,
  effectiveWeights,
  farePax,
  isFeasible,
  rankJourneys,
} from '@/domain/scoring';
import { getCity, STOPOVER_HUBS, type City } from '@/data/datasets/cities';
import { ProviderError } from '@/data/provider/errors';
import type { JourneyProvider } from '@/data/provider/JourneyProvider';
import { isoAt, makeLeg, minutesBetween, reDepartAfter, type TimeOfDay } from './generate-legs';
import { buildStopover } from './generate-stopovers';
import { createRng, toBase36Id, type Rng } from './rng';

// Tuning constants — chosen so typical routes yield 6–14 journeys.
const DIRECT_MAX_KM = 15_000;
const SINGLE_DETOUR_MAX = 1.45;
const COMBINED_DETOUR_MAX = 1.6;
const TOP_SINGLE_HUBS = 5;
const DOUBLE_NIGHTS_HUBS = 2; // top hubs that also get a longer-stay variant
const TOP_PAIR_HUBS = 4;
const MAX_TWO_STOP = 3;

const PROVIDER_ID = 'synthetic-v1';

interface Candidate {
  city: City;
  detour: number;
  rank: number; // hubStrength * appeal / detour
}

/** Seed excludes budget and preferences so the candidate universe is stable. */
function seedString(c: SearchCriteria): string {
  return `${c.origin}|${c.destination}|${c.departureDate}|${c.returnDate ?? ''}|${c.cabin}|${
    c.pax.adults + c.pax.children
  }`;
}

function roomsFor(c: SearchCriteria): number {
  return Math.ceil((c.pax.adults + c.pax.children) / 2);
}

function flightsTotal(legs: Leg[], c: SearchCriteria): number {
  const fpax = farePax(c.pax);
  return legs.reduce((sum, leg) => sum + leg.pricePerPax.amount * fpax, 0);
}

function postFlightHeadroomPct(legs: Leg[], c: SearchCriteria): number {
  const budget = c.budget.amount;
  if (budget <= 0) return 0;
  return Math.max(0, Math.min(1, (budget - flightsTotal(legs, c)) / budget));
}

/**
 * Assemble a Journey with a PLACEHOLDER score/badges — `rankJourneys` overwrites
 * both. `id` is a stable hash of the seed + variant so `getJourney` re-derives.
 */
function assembleJourney(
  kind: JourneyKind,
  legs: Leg[],
  stopovers: StopoverCity[],
  criteria: SearchCriteria,
  idSeed: string,
): Journey {
  const cost = computeCostBreakdown({
    legs,
    stopovers,
    pax: criteria.pax,
    budget: criteria.budget,
  });
  const totalTravelTimeMinutes = legs.reduce((sum, l) => sum + l.durationMinutes, 0);
  const doorToDoorMinutes = minutesBetween(legs[0].departure, legs[legs.length - 1].arrival);

  const zeroFactors = {
    stopoverAppeal: 0,
    comfort: 0,
    travelTimeEfficiency: 0,
    layoverQuality: 0,
    valueForMoney: 0,
    scheduleConvenience: 0,
  };

  return {
    id: toBase36Id(idSeed),
    kind,
    criteria,
    legs,
    stopovers,
    totalTravelTimeMinutes,
    doorToDoorMinutes,
    cost,
    score: {
      total: 0,
      factors: { ...zeroFactors },
      weights: effectiveWeights(criteria.preferences),
      narrative: '',
    },
    badges: [],
  };
}

// ——— direct journeys ———

const DIRECT_VARIANTS: ReadonlyArray<{ key: string; hours: number[] }> = [
  { key: 'direct-morning', hours: [7, 8, 9, 10] },
  { key: 'direct-afternoon', hours: [13, 14, 15, 16] },
  { key: 'direct-redeye', hours: [22, 23, 0, 1] },
];

function buildDirectJourneys(o: City, d: City, criteria: SearchCriteria, seed: string): Journey[] {
  if (haversineKm(o, d) >= DIRECT_MAX_KM) return [];

  return DIRECT_VARIANTS.map((variant) => {
    const idSeed = `${seed}|${variant.key}`;
    const rng = createRng(idSeed);
    const hour = rng.pick(variant.hours);
    const departISO = isoAt(criteria.departureDate, hour, rng.randInt(0, 55));
    const { leg } = makeLeg({
      from: o,
      to: d,
      departISO,
      cabin: criteria.cabin,
      throughFare: false,
      idSeed,
      rng,
    });
    return assembleJourney('direct', [leg], [], criteria, idSeed);
  });
}

// ——— stopover candidate ranking ———

function rankedCandidates(o: City, d: City, maxDetour: number): Candidate[] {
  return STOPOVER_HUBS.filter((h) => h.iata !== o.iata && h.iata !== d.iata)
    .map((city) => {
      const detour = detourRatio(o, city, d);
      return { city, detour, rank: (city.hubStrength * city.appealScore) / detour };
    })
    .filter((c) => c.detour <= maxDetour)
    .sort((a, b) => b.rank - a.rank);
}

// ——— single-stop journeys ———

function buildSingleStopJourney(
  o: City,
  hub: City,
  d: City,
  nights: number,
  criteria: SearchCriteria,
  seed: string,
  variantKey: string,
): Journey {
  const idSeed = `${seed}|${variantKey}`;
  const rng = createRng(idSeed);

  const leg1Depart = isoAt(criteria.departureDate, rng.randInt(8, 11), rng.randInt(0, 55));
  const made1 = makeLeg({
    from: o,
    to: hub,
    departISO: leg1Depart,
    cabin: criteria.cabin,
    throughFare: true,
    idSeed: `${idSeed}|l1`,
    rng,
  });

  const timeOfDay: TimeOfDay = rng.weighted([
    ['morning', 3],
    ['evening', 1],
  ]);
  const leg2Depart = reDepartAfter(made1.arrivalISO, nights, timeOfDay, rng);
  const made2 = makeLeg({
    from: hub,
    to: d,
    departISO: leg2Depart,
    cabin: criteria.cabin,
    throughFare: true,
    idSeed: `${idSeed}|l2`,
    rng,
  });

  const legs = [made1.leg, made2.leg];
  const headroomPct = postFlightHeadroomPct(legs, criteria);
  const stopover = buildStopover({
    city: hub,
    nights,
    heads: criteria.pax.adults + criteria.pax.children,
    rooms: roomsFor(criteria),
    postFlightHeadroomPct: headroomPct,
    idSeed,
    rng,
  });

  return assembleJourney('stopover', legs, [stopover], criteria, idSeed);
}

function buildSingleStopJourneys(
  o: City,
  d: City,
  criteria: SearchCriteria,
  seed: string,
  candidates: Candidate[],
): Journey[] {
  const journeys: Journey[] = [];
  const hubs = candidates.slice(0, TOP_SINGLE_HUBS);

  hubs.forEach((cand, index) => {
    const nightVariants: number[] = [1];
    if (criteria.maxStopoverNights >= 2 && index < DOUBLE_NIGHTS_HUBS) {
      nightVariants.push(Math.min(2, criteria.maxStopoverNights));
    }
    for (const nights of nightVariants) {
      journeys.push(
        buildSingleStopJourney(
          o,
          cand.city,
          d,
          nights,
          criteria,
          seed,
          `stop1-${cand.city.iata}-n${nights}`,
        ),
      );
    }
  });

  return journeys;
}

// ——— two-stop journeys ———

interface HubPair {
  first: City;
  second: City;
  combined: number;
}

function rankedPairs(o: City, d: City, candidates: Candidate[]): HubPair[] {
  const pool = candidates.slice(0, TOP_PAIR_HUBS).map((c) => c.city);
  const direct = haversineKm(o, d);
  const pairs: HubPair[] = [];
  const seen = new Set<string>();

  for (const a of pool) {
    for (const b of pool) {
      if (a.iata === b.iata) continue;
      // Order so the hub nearer the origin comes first.
      const [first, second] =
        haversineKm(o, a) <= haversineKm(o, b) ? [a, b] : [b, a];
      const key = `${first.iata}-${second.iata}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const combined =
        (haversineKm(o, first) + haversineKm(first, second) + haversineKm(second, d)) / direct;
      if (combined <= COMBINED_DETOUR_MAX) {
        pairs.push({ first, second, combined });
      }
    }
  }

  return pairs
    .sort(
      (x, y) =>
        y.first.appealScore +
        y.second.appealScore -
        (x.first.appealScore + x.second.appealScore) ||
        x.combined - y.combined,
    )
    .slice(0, MAX_TWO_STOP);
}

function buildTwoStopJourney(
  o: City,
  pair: HubPair,
  d: City,
  criteria: SearchCriteria,
  seed: string,
): Journey {
  const variantKey = `stop2-${pair.first.iata}-${pair.second.iata}`;
  const idSeed = `${seed}|${variantKey}`;
  const rng = createRng(idSeed);

  const leg1Depart = isoAt(criteria.departureDate, rng.randInt(8, 11), rng.randInt(0, 55));
  const made1 = makeLeg({
    from: o,
    to: pair.first,
    departISO: leg1Depart,
    cabin: criteria.cabin,
    throughFare: true,
    idSeed: `${idSeed}|l1`,
    rng,
  });

  const leg2Depart = reDepartAfter(made1.arrivalISO, 1, 'morning', rng);
  const made2 = makeLeg({
    from: pair.first,
    to: pair.second,
    departISO: leg2Depart,
    cabin: criteria.cabin,
    throughFare: true,
    idSeed: `${idSeed}|l2`,
    rng,
  });

  const leg3Depart = reDepartAfter(made2.arrivalISO, 1, 'morning', rng);
  const made3 = makeLeg({
    from: pair.second,
    to: d,
    departISO: leg3Depart,
    cabin: criteria.cabin,
    throughFare: true,
    idSeed: `${idSeed}|l3`,
    rng,
  });

  const legs = [made1.leg, made2.leg, made3.leg];
  const headroomPct = postFlightHeadroomPct(legs, criteria);
  const heads = criteria.pax.adults + criteria.pax.children;
  const rooms = roomsFor(criteria);

  const stopover1 = buildStopover({
    city: pair.first,
    nights: 1,
    heads,
    rooms,
    postFlightHeadroomPct: headroomPct,
    idSeed: `${idSeed}|s1`,
    rng,
  });
  const stopover2 = buildStopover({
    city: pair.second,
    nights: 1,
    heads,
    rooms,
    postFlightHeadroomPct: headroomPct,
    idSeed: `${idSeed}|s2`,
    rng,
  });

  return assembleJourney('stopover', legs, [stopover1, stopover2], criteria, idSeed);
}

// ——— pipeline ———

function defaultGeneratedAt(criteria: SearchCriteria): string {
  return `${criteria.departureDate}T00:00:00.000Z`;
}

/**
 * PURE journey generator. Deterministic for a given `criteria`; `generatedAt`
 * defaults to a value derived from the departure date so the whole result is a
 * pure function of its input.
 */
export function generateSearchResult(
  criteria: SearchCriteria,
  generatedAt: string = defaultGeneratedAt(criteria),
): SearchResult {
  const parsed = searchCriteriaSchema.safeParse(criteria);
  if (!parsed.success) {
    throw new ProviderError(
      'INVALID_CRITERIA',
      `Invalid search criteria: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const o = getCity(criteria.origin);
  const d = getCity(criteria.destination);
  if (!o) throw new ProviderError('UNKNOWN_AIRPORT', `Unknown origin airport: ${criteria.origin}`);
  if (!d) {
    throw new ProviderError('UNKNOWN_AIRPORT', `Unknown destination airport: ${criteria.destination}`);
  }

  const seed = seedString(criteria);
  const journeys: Journey[] = [];

  journeys.push(...buildDirectJourneys(o, d, criteria, seed));

  if (criteria.maxStopovers >= 1) {
    const candidates = rankedCandidates(o, d, SINGLE_DETOUR_MAX);
    journeys.push(...buildSingleStopJourneys(o, d, criteria, seed, candidates));

    if (criteria.maxStopovers === 2) {
      const pairs = rankedPairs(o, d, candidates);
      for (const pair of pairs) {
        journeys.push(buildTwoStopJourney(o, pair, d, criteria, seed));
      }
    }
  }

  const feasible = journeys.filter(isFeasible);
  if (feasible.length === 0) {
    throw new ProviderError(
      'NO_ROUTES',
      `No feasible routes found from ${criteria.origin} to ${criteria.destination}.`,
    );
  }

  const { kept, overBudgetFiltered, cheapestOverBudget } = applyBudgetConstraint(
    feasible,
    criteria,
  );
  const ranked = rankJourneys(kept, criteria);

  const result: SearchResult = {
    criteria,
    journeys: ranked,
    generatedAt,
    providerId: PROVIDER_ID,
    stats: {
      candidatesConsidered: feasible.length,
      overBudgetFiltered,
      ...(cheapestOverBudget ? { cheapestOverBudget } : {}),
    },
  };

  // Validate our own output against the domain contract before returning.
  return searchResultSchema.parse(result);
}

// ——— provider wrapper ———

/** Seeded pseudo-latency (120–520ms) so loading states are exercised. */
function seededLatencyMs(rng: Rng): number {
  return 120 + Math.floor(rng.rand() * 400);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderError('PROVIDER_FAILURE', 'Search aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new ProviderError('PROVIDER_FAILURE', 'Search aborted'));
      },
      { once: true },
    );
  });
}

export class SyntheticJourneyProvider implements JourneyProvider {
  readonly id = PROVIDER_ID;

  async searchJourneys(
    criteria: SearchCriteria,
    opts?: { signal?: AbortSignal },
  ): Promise<SearchResult> {
    const rng = createRng(`latency|${seedString(criteria)}`);
    await delay(seededLatencyMs(rng), opts?.signal);
    return generateSearchResult(criteria);
  }

  async getJourney(journeyId: string, criteria: SearchCriteria): Promise<Journey | null> {
    const result = generateSearchResult(criteria);
    return result.journeys.find((j) => j.id === journeyId) ?? null;
  }
}

export const syntheticProvider = new SyntheticJourneyProvider();
