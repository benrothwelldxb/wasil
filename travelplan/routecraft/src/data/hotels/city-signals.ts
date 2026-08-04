/**
 * Generic per-city signal accessors for the Journey Score domain layer and
 * for presentational UI. Reuses the internal livability + climate model
 * (`./livability`) but returns only generic domain shapes — never the
 * curated `CityLivability`/`CityClimateProfile` internals, which stay
 * private to `src/data/hotels/**`.
 */
import { weatherComfortScore } from '@/domain/journey-score';
import type { WeatherSummary } from '@/domain/hotels/types';
import { getLivability, hasCuratedCity, weatherForMonth } from './livability';

/**
 * No specific stay date is known at the journey-score layer (unlike the
 * per-stopover hotel search, which uses the real check-in month) — June is a
 * neutral, deterministic stand-in for "typical" seasonal weather.
 */
const REPRESENTATIVE_MONTH = 6;

/** Generic, provider-agnostic per-city signals (all 0–100). */
export interface CitySignals {
  safety?: number;
  neighbourhoodQuality?: number;
  weather?: number;
}

/**
 * Synchronous, generic per-city signals for the Journey Score: safety and
 * neighbourhood quality (0–100), plus a weather comfort score for a
 * representative month. Falls back to `getLivability`'s deterministic,
 * `appealScore`-derived estimate for any city not explicitly curated.
 */
export function getCitySignals(iata: string, appealScore = 50): CitySignals {
  const livability = getLivability(iata, appealScore);
  const weather = weatherForMonth(livability.climate, REPRESENTATIVE_MONTH);
  return {
    safety: livability.safetyScore,
    neighbourhoodQuality: Math.min(100, Math.max(0, livability.neighbourhoodRating * 20)),
    weather: weatherComfortScore(weather),
  };
}

/**
 * Synchronous, generic weather summary for a city, for presentational use
 * (e.g. a card's weather chip). `month` is 0–11 (JS `Date#getMonth`
 * convention) and defaults to `REPRESENTATIVE_MONTH` — a neutral,
 * deterministic stand-in for "typical" seasonal weather when no specific
 * date is known. Returns `undefined` for any city without curated
 * livability/climate data, rather than silently falling back to a generic
 * estimate — weather is presentational and shouldn't imply false precision
 * for an unmodelled city.
 */
export function getCityWeather(iata: string, month?: number): WeatherSummary | undefined {
  if (!hasCuratedCity(iata)) return undefined;
  const requestMonth = month === undefined ? REPRESENTATIVE_MONTH : (((month % 12) + 12) % 12) + 1;
  const livability = getLivability(iata, 50);
  return weatherForMonth(livability.climate, requestMonth);
}
