/**
 * Wires the pure stopover discovery engine (`@/domain/stopover`) to the real
 * dataset and synthetic ports, and converts its `DiscoveryResult` into the
 * standard `SearchResult` shape so the engine can ride the existing
 * provider-independent pipeline (see `StopoverDiscoveryAdapter.ts`).
 */
import type { SearchCriteria, SearchResult } from '@/domain/types';
import { ProviderError } from '@/data/provider/errors';
import type { DiscoveryDeps, DiscoveryRequest } from '@/domain/stopover';
import { discoverStopoverJourneys, heuristicRecommender } from '@/domain/stopover';
import { CITY_POOL } from './city-pool';
import { createSyntheticFlightSearch, createSyntheticHotelEstimator } from './synthetic-ports';

const PROVIDER_ID = 'stopover-v1';

const KNOWN_IATA_CODES: ReadonlySet<string> = new Set(CITY_POOL.map((c) => c.iata));

/** Maps the shared `SearchCriteria` shape onto the engine's narrower `DiscoveryRequest`. */
export function criteriaToDiscoveryRequest(criteria: SearchCriteria): DiscoveryRequest {
  return {
    origin: criteria.origin,
    destination: criteria.destination,
    maxStopovers: criteria.maxStopovers,
    maxStopoverNights: criteria.maxStopoverNights,
    budget: criteria.budget,
    departureDate: criteria.departureDate,
    pax: criteria.pax,
    cabin: criteria.cabin,
    preferences: criteria.preferences,
  };
}

interface DiscoverJourneysOpts {
  signal?: AbortSignal;
}

/**
 * Runs the discovery engine for `criteria` against the real city pool and
 * synthetic ports, returning a standard `SearchResult`. Throws
 * `ProviderError('UNKNOWN_AIRPORT', ...)` if either endpoint is outside the
 * curated city pool.
 */
export async function discoverJourneys(
  criteria: SearchCriteria,
  opts?: DiscoverJourneysOpts,
): Promise<SearchResult> {
  if (!KNOWN_IATA_CODES.has(criteria.origin)) {
    throw new ProviderError('UNKNOWN_AIRPORT', `Unknown origin airport: ${criteria.origin}`);
  }
  if (!KNOWN_IATA_CODES.has(criteria.destination)) {
    throw new ProviderError(
      'UNKNOWN_AIRPORT',
      `Unknown destination airport: ${criteria.destination}`,
    );
  }

  const request = criteriaToDiscoveryRequest(criteria);
  const deps: DiscoveryDeps = {
    recommender: heuristicRecommender,
    cityPool: CITY_POOL,
    flightSearch: createSyntheticFlightSearch(),
    hotelEstimator: createSyntheticHotelEstimator(),
  };

  const result = await discoverStopoverJourneys(request, deps, opts);

  return {
    criteria,
    journeys: result.journeys,
    generatedAt: `${request.departureDate}T00:00:00Z`,
    providerId: PROVIDER_ID,
    stats: {
      candidatesConsidered: result.diagnostics.citiesConsidered,
      overBudgetFiltered: result.diagnostics.overBudgetFiltered,
      ...(result.diagnostics.cheapestOverBudget
        ? { cheapestOverBudget: result.diagnostics.cheapestOverBudget }
        : {}),
    },
  };
}
