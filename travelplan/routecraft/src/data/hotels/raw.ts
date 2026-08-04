/**
 * INTERNAL provider wire shape for the synthetic hotel supplier.
 *
 * This models what a real hotel-API response payload tends to look like:
 * snake_case fields, differently-named metrics, prices in integer cents, and a
 * percentage point (0..100) instead of a fraction for precipitation. It is
 * deliberately NOT shaped like `StopoverAccommodation` — `normalise.ts` is the
 * only place that is allowed to translate one into the other.
 *
 * BOUNDARY RULE: nothing in this file is exported from `./index.ts`, and
 * nothing outside `src/data/hotels/**` may import from this module. Only
 * `StopoverAccommodation` / `HotelProvider` (the generic contract) may cross
 * that line.
 */
import { z } from 'zod';
import type { HotelOption } from '@/domain/types';
import { hotelOptionSchema } from '@/domain/schemas';

export interface RawWeather {
  cond: 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'snowy';
  hi_c: number;
  lo_c: number;
  /** Percentage points, 0..100 — NOT a 0..1 fraction like the generic model. */
  precip_pct: number;
}

export interface RawTransfer {
  mode: 'metro' | 'train' | 'taxi' | 'shuttle';
  mins: number;
  /** Integer cents, not a `Money` decimal amount. */
  cost_cents: number;
  comfort_1_5: number;
}

/** The raw supplier payload for one stopover accommodation quote. */
export interface RawHotelQuote {
  city_iata: string;
  city_name: string;
  country_code: string;
  los_nights: number;
  room_count: number;
  /**
   * The supplier already returns per-tier hotel rates using the app's generic
   * hotel-option shape (id/tier/pricing/amenities) — that part of the wire
   * format happens to line up with `HotelOption`. Everything else on this
   * payload does not, which is the point of this fixture.
   */
  hotel_rates: HotelOption[];
  walkability_0_100: number;
  safety_index: number;
  hood_stars_0_5: number;
  wx: RawWeather;
  transfer: RawTransfer;
  /** Supplier-side telemetry id — never surfaced as `providerId` verbatim. */
  supplier_ref: string;
}

const rawWeatherSchema = z.object({
  cond: z.enum(['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'snowy']),
  hi_c: z.number(),
  lo_c: z.number(),
  precip_pct: z.number().min(0).max(100),
});

const rawTransferSchema = z.object({
  mode: z.enum(['metro', 'train', 'taxi', 'shuttle']),
  mins: z.number().nonnegative(),
  cost_cents: z.number().nonnegative(),
  comfort_1_5: z.number(),
});

/** Internal validation only — never exported alongside the generic schemas. */
const rawHotelQuoteSchema = z.object({
  city_iata: z.string().min(1),
  city_name: z.string().min(1),
  country_code: z.string().min(1),
  los_nights: z.number().int().positive(),
  room_count: z.number().int().positive(),
  hotel_rates: z.array(hotelOptionSchema).min(1),
  walkability_0_100: z.number(),
  safety_index: z.number(),
  hood_stars_0_5: z.number(),
  wx: rawWeatherSchema,
  transfer: rawTransferSchema,
  supplier_ref: z.string().min(1),
});

/** Parses/validates a raw supplier payload before it reaches `normalise.ts`. */
export function parseRawHotelQuote(input: RawHotelQuote): RawHotelQuote {
  return rawHotelQuoteSchema.parse(input) as RawHotelQuote;
}
