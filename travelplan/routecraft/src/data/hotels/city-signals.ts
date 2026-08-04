/**
 * Generic per-city signal accessor for the Journey Score domain layer.
 * Reuses the internal livability + climate model (`./livability`) but returns
 * only the generic 0–100 shape the domain expects — never the curated
 * `CityLivability`/`CityClimateProfile` internals, which stay private to
 * `src/data/hotels/**`.
 */
import { weatherComfortScore } from '@/domain/journey-score';
import { getLivability, weatherForMonth } from './livability';

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
