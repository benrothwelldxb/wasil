/**
 * The synthetic hotel engine — implements the generic `HotelProvider` contract
 * against synthetic data, reusing the existing hotel/transfer generators and
 * pricing model. Deterministic: every random draw flows through a `Rng` seeded
 * from the request, so identical requests always yield byte-identical output.
 */
import type { HotelProvider, HotelSearchRequest, StopoverAccommodation } from '@/domain/hotels/types';
import { getCity } from '@/data/datasets/cities';
import { buildHotels } from '@/data/synthetic/generate-hotels';
import { buildTransfers } from '@/data/synthetic/generate-transfers';
import { createRng } from '@/data/synthetic/rng';
import { totalHeads } from '@/domain/scoring';
import { ProviderError } from '@/data/provider/errors';
import { getLivability, monthOf, weatherForMonth } from './livability';
import { normaliseRawHotelQuote } from './normalise';
import type { RawHotelQuote } from './raw';

const PROVIDER_ID = 'synthetic-hotels-v1';

/** Jitter fraction applied to a curated metric before clamping. */
const METRIC_JITTER_PCT = 0.05;
const TEMP_JITTER_PCT = 0.08;
const PRECIP_JITTER_PCT = 0.1;

function seedFor(req: HotelSearchRequest): string {
  const heads = totalHeads(req.pax);
  return `hotels|${req.cityIata}|${req.nights}|${req.date}|${heads}`;
}

const jitterClamp = (
  rng: ReturnType<typeof createRng>,
  base: number,
  pct: number,
  min: number,
  max: number,
): number => Math.min(max, Math.max(min, rng.jitter(base, pct)));

/**
 * PURE core: given a `HotelSearchRequest` deterministically produce a fully
 * normalised, schema-validated `StopoverAccommodation`.
 */
export function generateAccommodation(req: HotelSearchRequest): StopoverAccommodation {
  const city = getCity(req.cityIata);
  if (!city) {
    throw new ProviderError('UNKNOWN_AIRPORT', `Unknown city IATA: ${req.cityIata}`);
  }

  const seed = seedFor(req);
  const rng = createRng(seed);
  const heads = totalHeads(req.pax);
  const rooms = Math.ceil(heads / 2);

  // No flight budget is available at the hotel-provider boundary; derive a
  // seeded pseudo post-flight headroom so tier selection still varies sensibly.
  const headroomPct = rng.rand();
  const { hotel, alternativeHotels } = buildHotels(
    city,
    req.nights,
    rooms,
    headroomPct,
    seed,
    rng,
  );
  const hotels = [hotel, ...alternativeHotels];

  const { arrival } = buildTransfers(city, heads, seed, rng);

  const livability = getLivability(city.iata, city.appealScore);
  const month = monthOf(req.date);
  const baseWeather = weatherForMonth(livability.climate, month);

  const walkability = jitterClamp(rng, livability.walkingScore, METRIC_JITTER_PCT, 0, 100);
  const safety = jitterClamp(rng, livability.safetyScore, METRIC_JITTER_PCT, 0, 100);
  const hoodRating = jitterClamp(rng, livability.neighbourhoodRating, METRIC_JITTER_PCT, 0, 5);
  const hiC = jitterClamp(rng, baseWeather.averageHighC, TEMP_JITTER_PCT, -60, 60);
  const loC = jitterClamp(rng, baseWeather.averageLowC, TEMP_JITTER_PCT, -70, 55);
  const precip = jitterClamp(rng, baseWeather.precipitationChance, PRECIP_JITTER_PCT, 0, 1);

  const raw: RawHotelQuote = {
    city_iata: city.iata,
    city_name: city.cityName,
    country_code: city.countryCode,
    los_nights: req.nights,
    room_count: rooms,
    hotel_rates: hotels,
    walkability_0_100: walkability,
    safety_index: safety,
    hood_stars_0_5: hoodRating,
    wx: {
      cond: baseWeather.condition,
      hi_c: hiC,
      lo_c: loC,
      precip_pct: precip * 100,
    },
    transfer: {
      mode: arrival.mode,
      mins: arrival.durationMinutes,
      cost_cents: Math.round(arrival.price.amount * 100),
      comfort_1_5: arrival.comfortRating,
    },
    supplier_ref: `${PROVIDER_ID}|${seed}`,
  };

  return normaliseRawHotelQuote(raw, PROVIDER_ID);
}

export class SyntheticHotelProvider implements HotelProvider {
  readonly id = PROVIDER_ID;

  async getAccommodation(
    req: HotelSearchRequest,
    _opts?: { signal?: AbortSignal },
  ): Promise<StopoverAccommodation> {
    return generateAccommodation(req);
  }
}

export const syntheticHotelProvider = new SyntheticHotelProvider();
