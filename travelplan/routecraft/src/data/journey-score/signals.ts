/**
 * Assembles the `JourneyScoreSignals` the pure `deriveJourneyScoreFactors`
 * needs, from the city dataset (`@/data/datasets/cities`) and the generic
 * hotel-layer city signals (`@/data/hotels`). Synchronous and side-effect
 * free: every lookup that can't resolve simply leaves a signal `undefined`,
 * which `deriveJourneyScoreFactors` turns into a `null` factor rather than
 * throwing. See `src/domain/journey-score/ALGORITHM.md`.
 */
import { haversineKm, estimateFlightMinutes } from '@/domain/geo';
import { getCity } from '@/data/datasets/cities';
import type { City } from '@/data/datasets/cities';
import { getCitySignals } from '@/data/hotels';
import { getUtcOffsetHours } from './timezones';
import type { CityScoreSignals, JourneyScoreSignals } from '@/domain/journey-score';
import type { Journey } from '@/domain/types';

const clamp = (n: number, min = 0, max = 100): number => Math.min(max, Math.max(min, n));

/** Bonus applied when a city's editorial tags call out food or nightlife. */
const FOOD_TAG_BONUS = 15;
const NIGHTLIFE_TAG_BONUS = 8;

/**
 * Food rating heuristic: the city's overall appeal, nudged up for cities
 * tagged for food and/or nightlife. There is no dedicated "food" metric in
 * the curated dataset, so this is a deliberately simple, deterministic proxy.
 */
function foodRatingForCity(city: City): number {
  let score = city.appealScore;
  if (city.tags.includes('food')) score += FOOD_TAG_BONUS;
  if (city.tags.includes('nightlife')) score += NIGHTLIFE_TAG_BONUS;
  return clamp(score);
}

/** `hubStrength` is 1–5; scaled to the 0–100 signal range. */
function airportQualityForCity(city: City): number {
  return clamp(city.hubStrength * 20);
}

function buildCityScoreSignals(iata: string): CityScoreSignals {
  const city = getCity(iata);
  if (!city) return {};

  const generic = getCitySignals(iata, city.appealScore);
  return {
    touristAppeal: city.appealScore,
    foodRating: foodRatingForCity(city),
    airportQuality: airportQualityForCity(city),
    safety: generic.safety,
    neighbourhoodQuality: generic.neighbourhoodQuality,
    weather: generic.weather,
    tzOffsetHours: getUtcOffsetHours(iata),
  };
}

function buildReferenceDurationMinutes(
  originIata: string,
  destIata: string,
): number | undefined {
  const origin = getCity(originIata);
  const dest = getCity(destIata);
  if (!origin || !dest) return undefined;
  return estimateFlightMinutes(haversineKm(origin, dest));
}

/**
 * Builds the enrichment signals for a journey's Journey Score: origin/
 * destination/stopover city signals plus the great-circle reference
 * duration. `signals.stopovers` is aligned by index with `journey.stopovers`.
 */
export function buildJourneyScoreSignals(journey: Journey): JourneyScoreSignals {
  const { origin: originIata, destination: destinationIata } = journey.criteria;

  const originCity = getCity(originIata);
  const origin: JourneyScoreSignals['origin'] = originCity
    ? { airportQuality: airportQualityForCity(originCity), tzOffsetHours: getUtcOffsetHours(originIata) }
    : { tzOffsetHours: getUtcOffsetHours(originIata) };

  const destination: JourneyScoreSignals['destination'] = buildCityScoreSignals(destinationIata);
  const stopovers = journey.stopovers.map((stopover) => buildCityScoreSignals(stopover.airport.iata));

  return {
    origin,
    destination,
    stopovers,
    referenceDurationMinutes: buildReferenceDurationMinutes(originIata, destinationIata),
  };
}
