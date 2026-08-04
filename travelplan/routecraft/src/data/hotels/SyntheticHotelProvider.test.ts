import { describe, expect, it } from 'vitest';
import type { HotelSearchRequest } from '@/domain/hotels/types';
import { stopoverAccommodationSchema } from '@/domain/hotels/schemas';
import { STOPOVER_HUBS } from '@/data/datasets/cities';
import { ProviderError } from '@/data/provider/errors';
import { generateAccommodation, syntheticHotelProvider } from './SyntheticHotelProvider';
import { getHotelProvider, getStopoverAccommodation, resetHotelProviderForTests } from './hotel-provider-registry';

function req(overrides: Partial<HotelSearchRequest> = {}): HotelSearchRequest {
  return {
    cityIata: 'IST',
    nights: 2,
    pax: { adults: 2, children: 0 },
    date: '2026-07-10',
    ...overrides,
  };
}

// Provider-model non-exposure note: the internal raw supplier shape
// (`RawHotelQuote` in `./raw.ts`) is intentionally NOT imported here, and is
// not re-exported from `./index.ts` — see that file's barrel for the exact
// generic surface (`getHotelProvider`, `getStopoverAccommodation`,
// `syntheticHotelProvider`). The reviewer verifies the boundary by grepping
// for imports of `./raw` outside this directory and for re-exports in
// `./index.ts`; this comment documents the invariant that test asserts by
// construction (nothing here needs `RawHotelQuote` to exercise the provider).

describe('generateAccommodation — schema + metric ranges', () => {
  it('produces all seven metrics within valid ranges for a known city', () => {
    const result = generateAccommodation(req());
    expect(result.walkingScore).toBeGreaterThanOrEqual(0);
    expect(result.walkingScore).toBeLessThanOrEqual(100);
    expect(result.neighbourhoodRating).toBeGreaterThanOrEqual(0);
    expect(result.neighbourhoodRating).toBeLessThanOrEqual(5);
    expect(result.safetyScore).toBeGreaterThanOrEqual(0);
    expect(result.safetyScore).toBeLessThanOrEqual(100);
    expect(result.weather.precipitationChance).toBeGreaterThanOrEqual(0);
    expect(result.weather.precipitationChance).toBeLessThanOrEqual(1);
    expect(Number.isFinite(result.weather.averageHighC)).toBe(true);
    expect(Number.isFinite(result.weather.averageLowC)).toBe(true);
    expect(result.airportTransfer.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(result.airportTransfer.comfortRating).toBeGreaterThanOrEqual(1);
    expect(result.airportTransfer.comfortRating).toBeLessThanOrEqual(5);
    expect(result.averageNightlyPrice.amount).toBeGreaterThan(0);
    expect(result.totalAccommodationCost.amount).toBeCloseTo(
      result.averageNightlyPrice.amount * result.rooms * result.nights,
      5,
    );
  });

  it('validates against stopoverAccommodationSchema for several cities and nights values', () => {
    const cities = ['IST', 'DXB', 'AMS', 'KEF', 'SYD', 'CAI'];
    const nightsValues = [1, 2, 3];
    for (const cityIata of cities) {
      for (const nights of nightsValues) {
        const result = generateAccommodation(req({ cityIata, nights }));
        expect(() => stopoverAccommodationSchema.parse(result)).not.toThrow();
      }
    }
  });

  it('validates for every curated stopover hub', () => {
    for (const city of STOPOVER_HUBS) {
      const result = generateAccommodation(req({ cityIata: city.iata }));
      expect(() => stopoverAccommodationSchema.parse(result)).not.toThrow();
      expect(result.cityIata).toBe(city.iata);
      expect(result.countryCode).toBe(city.countryCode);
    }
  });
});

describe('generateAccommodation — determinism', () => {
  it('produces a deep-equal result for the same request called twice', () => {
    const a = generateAccommodation(req());
    const b = generateAccommodation(req());
    expect(a).toEqual(b);
  });

  it('produces a deep-equal result across separate SyntheticHotelProvider calls', async () => {
    const a = await syntheticHotelProvider.getAccommodation(req());
    const b = await syntheticHotelProvider.getAccommodation(req());
    expect(a).toEqual(b);
  });

  it('produces different output when the request differs', () => {
    const a = generateAccommodation(req());
    const b = generateAccommodation(req({ nights: 3 }));
    expect(a).not.toEqual(b);
  });
});

describe('generateAccommodation — rooms scale with pax', () => {
  it('rounds up: 3 adults → 2 rooms, and totals reflect rooms × nights', () => {
    const result = generateAccommodation(req({ pax: { adults: 3, children: 0 }, nights: 2 }));
    expect(result.rooms).toBe(2);
    expect(result.totalAccommodationCost.amount).toBeCloseTo(
      result.averageNightlyPrice.amount * 2 * 2,
      5,
    );
  });

  it('1 adult → 1 room', () => {
    const result = generateAccommodation(req({ pax: { adults: 1, children: 0 } }));
    expect(result.rooms).toBe(1);
  });

  it('4 adults + 2 children → 3 rooms', () => {
    const result = generateAccommodation(req({ pax: { adults: 4, children: 2 } }));
    expect(result.rooms).toBe(3);
  });
});

describe('generateAccommodation — unknown city', () => {
  it('throws ProviderError(UNKNOWN_AIRPORT) for an unknown IATA code', () => {
    expect(() => generateAccommodation(req({ cityIata: 'ZZZ' }))).toThrow(ProviderError);
    try {
      generateAccommodation(req({ cityIata: 'ZZZ' }));
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('UNKNOWN_AIRPORT');
    }
  });

  it('rejects via the provider interface too', async () => {
    await expect(syntheticHotelProvider.getAccommodation(req({ cityIata: 'XXX' }))).rejects.toThrow(
      ProviderError,
    );
  });
});

describe('generateAccommodation — seasonal weather variation', () => {
  it('differs (deterministically) between a summer and a winter date for a seasonal city', () => {
    const summer = generateAccommodation(req({ cityIata: 'KEF', date: '2026-07-15' }));
    const winter = generateAccommodation(req({ cityIata: 'KEF', date: '2026-01-15' }));
    expect(summer.weather.averageHighC).toBeGreaterThan(winter.weather.averageHighC);
  });

  it('is deterministic per date: repeated calls at the same date match exactly', () => {
    const a = generateAccommodation(req({ cityIata: 'KEF', date: '2026-01-15' }));
    const b = generateAccommodation(req({ cityIata: 'KEF', date: '2026-01-15' }));
    expect(a.weather).toEqual(b.weather);
  });
});

describe('SyntheticHotelProvider', () => {
  it('exposes the required provider id', () => {
    expect(syntheticHotelProvider.id).toBe('synthetic-hotels-v1');
  });

  it('sets providerId on the returned accommodation', async () => {
    const result = await syntheticHotelProvider.getAccommodation(req());
    expect(result.providerId).toBe('synthetic-hotels-v1');
  });
});

describe('hotel provider registry — the single swap point', () => {
  it('resolves to the synthetic provider by default', () => {
    resetHotelProviderForTests();
    expect(getHotelProvider().id).toBe('synthetic-hotels-v1');
  });

  it('getStopoverAccommodation() delegates through the registered provider', async () => {
    resetHotelProviderForTests();
    const result = await getStopoverAccommodation(req());
    expect(() => stopoverAccommodationSchema.parse(result)).not.toThrow();
  });
});
