/**
 * Maps the INTERNAL raw supplier payload (`RawHotelQuote`) to the generic
 * `StopoverAccommodation` contract. This is the only file allowed to see both
 * shapes at once — everything else in the app sees only the generic side.
 *
 * Money and price totals are never trusted verbatim from the raw payload:
 * `averageNightlyPrice` is recomputed as the mean of the hotel options'
 * `pricePerNight`, and `totalAccommodationCost` is recomputed from that mean.
 */
import { stopoverAccommodationSchema } from '@/domain/hotels/schemas';
import type { StopoverAccommodation } from '@/domain/hotels/types';
import { money } from '@/domain/scoring';
import { ProviderError } from '@/data/provider/errors';
import { parseRawHotelQuote, type RawHotelQuote } from './raw';

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function normaliseRawHotelQuote(
  raw: RawHotelQuote,
  providerId: string,
): StopoverAccommodation {
  let validatedRaw: RawHotelQuote;
  try {
    validatedRaw = parseRawHotelQuote(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ProviderError('PROVIDER_FAILURE', `Malformed supplier payload: ${detail}`);
  }
  const hotels = validatedRaw.hotel_rates;

  if (hotels.length === 0) {
    throw new ProviderError('PROVIDER_FAILURE', 'Supplier returned zero hotel options.');
  }

  const meanNightly =
    hotels.reduce((sum, h) => sum + h.pricePerNight.amount, 0) / hotels.length;
  const averageNightlyPrice = money(meanNightly);
  const totalAccommodationCost = money(
    averageNightlyPrice.amount * validatedRaw.room_count * validatedRaw.los_nights,
  );

  const candidate: StopoverAccommodation = {
    cityIata: validatedRaw.city_iata,
    cityName: validatedRaw.city_name,
    countryCode: validatedRaw.country_code,
    nights: validatedRaw.los_nights,
    rooms: validatedRaw.room_count,
    hotels,
    averageNightlyPrice,
    totalAccommodationCost,
    walkingScore: clamp(validatedRaw.walkability_0_100, 0, 100),
    neighbourhoodRating: clamp(validatedRaw.hood_stars_0_5, 0, 5),
    safetyScore: clamp(validatedRaw.safety_index, 0, 100),
    weather: {
      condition: validatedRaw.wx.cond,
      averageHighC: validatedRaw.wx.hi_c,
      averageLowC: validatedRaw.wx.lo_c,
      precipitationChance: clamp(validatedRaw.wx.precip_pct / 100, 0, 1),
    },
    airportTransfer: {
      mode: validatedRaw.transfer.mode,
      durationMinutes: Math.max(0, validatedRaw.transfer.mins),
      price: money(validatedRaw.transfer.cost_cents / 100),
      comfortRating: clamp(validatedRaw.transfer.comfort_1_5, 1, 5),
    },
    providerId,
  };

  const parsed = stopoverAccommodationSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_FAILURE',
      `Normalised hotel payload failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
