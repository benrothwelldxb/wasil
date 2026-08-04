import { describe, expect, it } from 'vitest';
import { legSchema, hotelOptionSchema, transferSchema } from '@/domain/schemas';
import type {
  CandidateCity,
  FlightSearchRequest,
  HotelEstimateRequest,
} from '@/domain/stopover';
import { isProviderError } from '@/data/provider/errors';
import { CITY_POOL } from './city-pool';
import { createSyntheticFlightSearch, createSyntheticHotelEstimator } from './synthetic-ports';

const flightRequest = (overrides: Partial<FlightSearchRequest> = {}): FlightSearchRequest => ({
  from: 'DXB',
  to: 'IST',
  date: '2026-09-15',
  cabin: 'economy',
  pax: { adults: 1, children: 0 },
  ...overrides,
});

function findCity(iata: string): CandidateCity {
  const city = CITY_POOL.find((c) => c.iata === iata);
  if (!city) throw new Error(`fixture city ${iata} missing from CITY_POOL`);
  return city;
}

const hotelRequest = (overrides: Partial<HotelEstimateRequest> = {}): HotelEstimateRequest => ({
  city: findCity('IST'),
  nights: 2,
  rooms: 1,
  date: '2026-09-15',
  ...overrides,
});

describe('createSyntheticFlightSearch', () => {
  it('returns at least one valid Leg for a known origin/destination pair', async () => {
    const port = createSyntheticFlightSearch();
    const legs = await port.search(flightRequest());

    expect(legs.length).toBeGreaterThanOrEqual(1);
    for (const leg of legs) {
      expect(() => legSchema.parse(leg)).not.toThrow();
      expect(leg.from.iata).toBe('DXB');
      expect(leg.to.iata).toBe('IST');
    }
  });

  it('is deterministic: the same request yields the same legs', async () => {
    const port = createSyntheticFlightSearch();
    const a = await port.search(flightRequest());
    const b = await port.search(flightRequest());
    expect(a).toEqual(b);
  });

  it('rejects with ProviderError("UNKNOWN_AIRPORT") for an unknown origin', async () => {
    const port = createSyntheticFlightSearch();
    const err = await port.search(flightRequest({ from: 'ZZZ' })).catch((e: unknown) => e);

    expect(isProviderError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'UNKNOWN_AIRPORT' });
  });

  it('rejects with ProviderError("UNKNOWN_AIRPORT") for an unknown destination', async () => {
    const port = createSyntheticFlightSearch();
    const err = await port.search(flightRequest({ to: 'ZZZ' })).catch((e: unknown) => e);

    expect(isProviderError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'UNKNOWN_AIRPORT' });
  });
});

describe('createSyntheticHotelEstimator', () => {
  it('returns a valid hotel, alternative hotels, and transfers', async () => {
    const port = createSyntheticHotelEstimator();
    const result = await port.estimate(hotelRequest());

    expect(() => hotelOptionSchema.parse(result.hotel)).not.toThrow();
    expect(result.alternativeHotels.length).toBeGreaterThan(0);
    for (const alt of result.alternativeHotels) {
      expect(() => hotelOptionSchema.parse(alt)).not.toThrow();
    }
    expect(() => transferSchema.parse(result.transfers.arrival)).not.toThrow();
    expect(() => transferSchema.parse(result.transfers.departure)).not.toThrow();
  });

  it('is deterministic: the same request yields the same estimate', async () => {
    const port = createSyntheticHotelEstimator();
    const a = await port.estimate(hotelRequest());
    const b = await port.estimate(hotelRequest());
    expect(a).toEqual(b);
  });

  it('rejects with ProviderError("UNKNOWN_AIRPORT") for an unknown city', async () => {
    const port = createSyntheticHotelEstimator();
    const err = await port
      .estimate(hotelRequest({ city: { ...findCity('IST'), iata: 'ZZZ' } }))
      .catch((e: unknown) => e);

    expect(isProviderError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'UNKNOWN_AIRPORT' });
  });
});
