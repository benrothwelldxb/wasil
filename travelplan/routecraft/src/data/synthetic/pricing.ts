/**
 * Pricing model — the only place fares, hotel rates, and transfer prices are
 * computed. All figures are USD. Numbers are intentionally rough but internally
 * consistent so that budget headroom behaves sensibly.
 */
import type { CabinClass, TransferMode } from '@/domain/types';
import type { Rng } from './rng';

/** Cabin multipliers on the base adult fare. */
export const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  economy: 1.0,
  premium_economy: 1.7,
  business: 2.9,
};

const RED_EYE_FARE_FACTOR = 0.82;
/** Applied once per leg on multi-leg (through-fare) itineraries. */
export const THROUGH_FARE_FACTOR = 0.92;
const FARE_JITTER_PCT = 0.12;
const HOTEL_JITTER_PCT = 0.15;

export interface AdultFareInput {
  km: number;
  cabin: CabinClass;
  priceFactor: number; // airline.priceFactor
  isRedEye: boolean;
  throughFare: boolean; // part of a multi-leg itinerary
  rng: Rng;
}

/**
 * Adult one-way fare for a single leg. `leg.pricePerPax` stores this adult
 * fare; the cost layer applies the child discount separately.
 */
export function priceAdultFare({
  km,
  cabin,
  priceFactor,
  isRedEye,
  throughFare,
  rng,
}: AdultFareInput): number {
  const base = 45 + 0.11 * km;
  let fare = base * CABIN_MULTIPLIER[cabin] * priceFactor;
  if (isRedEye) fare *= RED_EYE_FARE_FACTOR;
  if (throughFare) fare *= THROUGH_FARE_FACTOR;
  fare = rng.jitter(fare, FARE_JITTER_PCT);
  return Math.round(fare);
}

/** Per-night hotel rate from a city base rate with seeded jitter. */
export function priceHotelNight(baseRate: number, rng: Rng): number {
  return Math.round(rng.jitter(baseRate, HOTEL_JITTER_PCT));
}

interface TransferConfig {
  perHead: number;
  partyBase: number; // flat component covering the whole party
  durationMinutes: number;
  comfortRating: number;
}

const TRANSFER_CONFIG: Record<TransferMode, TransferConfig> = {
  metro: { perHead: 6, partyBase: 0, durationMinutes: 45, comfortRating: 3 },
  train: { perHead: 12, partyBase: 4, durationMinutes: 32, comfortRating: 4 },
  taxi: { perHead: 6, partyBase: 40, durationMinutes: 28, comfortRating: 5 },
  shuttle: { perHead: 18, partyBase: 6, durationMinutes: 55, comfortRating: 3 },
};

export interface TransferQuote {
  price: number; // total for the party
  durationMinutes: number;
  comfortRating: number;
}

/** Price and time a ground transfer for the whole party. */
export function quoteTransfer(mode: TransferMode, heads: number, rng: Rng): TransferQuote {
  const cfg = TRANSFER_CONFIG[mode];
  const price = Math.round(rng.jitter(cfg.partyBase + cfg.perHead * heads, 0.1));
  const durationMinutes = Math.round(rng.jitter(cfg.durationMinutes, 0.15));
  return { price, durationMinutes, comfortRating: cfg.comfortRating };
}
