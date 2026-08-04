/**
 * Maps the curated city dataset (`@/data/datasets/cities`) into the discovery
 * engine's `CandidateCity` shape.
 *
 * Every `CITIES` entry is included — not just `STOPOVER_HUBS` — so that
 * whatever origin/destination the caller passes always resolves in the pool.
 * `recommend.ts`'s detour computation looks up origin/destination coordinates
 * via `cityPool.find(...)`; if either endpoint were missing, the engine would
 * fall back to a neutral detour score instead of the real geography.
 */
import { money } from '@/domain/scoring';
import type { CandidateCity } from '@/domain/stopover';
import { CITIES, type City } from '@/data/datasets/cities';

function toCandidateCity(city: City): CandidateCity {
  return {
    iata: city.iata,
    cityName: city.cityName,
    countryCode: city.countryCode,
    lat: city.lat,
    lon: city.lon,
    hubStrength: city.hubStrength,
    appealScore: city.appealScore,
    tags: city.tags,
    hotelBaseNightly: money(city.hotelBaseRates.midscale),
    headline: city.headline,
    highlights: city.highlights,
    ...(city.visaNote !== undefined ? { visaNote: city.visaNote } : {}),
  };
}

/** Computed once at module load; `CITIES` is a static dataset. */
const CITY_POOL_INTERNAL: CandidateCity[] = CITIES.map(toCandidateCity);

/** Returns the memoised city pool. */
export function buildCityPool(): CandidateCity[] {
  return CITY_POOL_INTERNAL;
}

/** The memoised city pool — the injected `DiscoveryDeps.cityPool` in production. */
export const CITY_POOL: readonly CandidateCity[] = CITY_POOL_INTERNAL;
