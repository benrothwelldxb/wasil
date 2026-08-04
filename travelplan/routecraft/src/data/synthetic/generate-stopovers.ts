/**
 * Assembles a `StopoverCity` — editorial copy from the dataset plus a selected
 * hotel and its ground transfers. Pure: all randomness flows through the passed
 * RNG, all money through the pricing model.
 */
import type { StopoverCity } from '@/domain/types';
import type { City } from '@/data/datasets/cities';
import { toAirportRef } from './generate-legs';
import { buildHotels } from './generate-hotels';
import { buildTransfers } from './generate-transfers';
import type { Rng } from './rng';

export interface BuildStopoverInput {
  city: City;
  nights: number;
  heads: number;
  rooms: number;
  postFlightHeadroomPct: number;
  idSeed: string;
  rng: Rng;
}

export function buildStopover({
  city,
  nights,
  heads,
  rooms,
  postFlightHeadroomPct,
  idSeed,
  rng,
}: BuildStopoverInput): StopoverCity {
  const { hotel, alternativeHotels } = buildHotels(
    city,
    nights,
    rooms,
    postFlightHeadroomPct,
    idSeed,
    rng,
  );
  const transfers = buildTransfers(city, heads, idSeed, rng);

  return {
    airport: toAirportRef(city),
    cityName: city.cityName,
    countryCode: city.countryCode,
    nights,
    appealScore: city.appealScore,
    tags: [...city.tags],
    headline: city.headline,
    highlights: [...city.highlights],
    ...(city.visaNote ? { visaNote: city.visaNote } : {}),
    hotel,
    alternativeHotels,
    transfers,
  };
}
