import { describe, expect, it } from 'vitest';
import { stopoverAccommodationSchema } from '@/domain/hotels/schemas';
import { ProviderError } from '@/data/provider/errors';
import { normaliseRawHotelQuote } from './normalise';
import type { RawHotelQuote } from './raw';

function baseRaw(overrides: Partial<RawHotelQuote> = {}): RawHotelQuote {
  return {
    city_iata: 'IST',
    city_name: 'Istanbul',
    country_code: 'TR',
    los_nights: 2,
    room_count: 1,
    hotel_rates: [
      {
        id: 'h1',
        name: 'Test Budget',
        tier: 'budget',
        starRating: 3,
        guestRating: 7.2,
        neighborhood: 'Old Town',
        pricePerNight: { amount: 90, currency: 'USD' },
        totalPrice: { amount: 180, currency: 'USD' },
        amenities: ['Free Wi-Fi'],
      },
      {
        id: 'h2',
        name: 'Test Midscale',
        tier: 'midscale',
        starRating: 4,
        guestRating: 8.1,
        neighborhood: 'Karaköy',
        pricePerNight: { amount: 130, currency: 'USD' },
        totalPrice: { amount: 260, currency: 'USD' },
        amenities: ['Free Wi-Fi', 'Breakfast included'],
      },
    ],
    walkability_0_100: 78,
    safety_index: 62,
    hood_stars_0_5: 3.8,
    wx: { cond: 'sunny', hi_c: 29, lo_c: 20, precip_pct: 15 },
    transfer: { mode: 'taxi', mins: 40, cost_cents: 5000, comfort_1_5: 4 },
    supplier_ref: 'synthetic-hotels-v1|seed',
    ...overrides,
  };
}

describe('normaliseRawHotelQuote', () => {
  it('maps the raw supplier payload onto the generic contract', () => {
    const result = normaliseRawHotelQuote(baseRaw(), 'synthetic-hotels-v1');
    expect(() => stopoverAccommodationSchema.parse(result)).not.toThrow();
    expect(result.cityIata).toBe('IST');
    expect(result.providerId).toBe('synthetic-hotels-v1');
    expect(result.hotels).toHaveLength(2);
  });

  it('converts precipitation percentage points to a 0..1 fraction', () => {
    const result = normaliseRawHotelQuote(baseRaw(), 'synthetic-hotels-v1');
    expect(result.weather.precipitationChance).toBeCloseTo(0.15, 5);
  });

  it('converts transfer cost cents to a Money decimal amount', () => {
    const result = normaliseRawHotelQuote(baseRaw(), 'synthetic-hotels-v1');
    expect(result.airportTransfer.price.amount).toBeCloseTo(50, 5);
  });

  it('never trusts raw totals: recomputes averageNightlyPrice as the mean of hotel prices', () => {
    const result = normaliseRawHotelQuote(baseRaw(), 'synthetic-hotels-v1');
    // (90 + 130) / 2 = 110
    expect(result.averageNightlyPrice.amount).toBeCloseTo(110, 5);
  });

  it('recomputes totalAccommodationCost = averageNightlyPrice × rooms × nights', () => {
    const raw = baseRaw({ room_count: 3, los_nights: 2 });
    const result = normaliseRawHotelQuote(raw, 'synthetic-hotels-v1');
    const expectedTotal = result.averageNightlyPrice.amount * 3 * 2;
    expect(result.totalAccommodationCost.amount).toBeCloseTo(expectedTotal, 5);
  });

  it('ignores a bogus raw total_price on the hotel options and recomputes from pricePerNight', () => {
    const raw = baseRaw();
    // Corrupt the underlying hotel totals — normalise must not trust them.
    raw.hotel_rates = raw.hotel_rates.map((h) => ({
      ...h,
      totalPrice: { amount: 999_999, currency: 'USD' },
    }));
    const result = normaliseRawHotelQuote(raw, 'synthetic-hotels-v1');
    expect(result.totalAccommodationCost.amount).toBeLessThan(1000);
  });

  it('clamps out-of-range metrics into their valid ranges', () => {
    const raw = baseRaw({
      walkability_0_100: 140,
      safety_index: -20,
      hood_stars_0_5: 9,
    });
    const result = normaliseRawHotelQuote(raw, 'synthetic-hotels-v1');
    expect(result.walkingScore).toBe(100);
    expect(result.safetyScore).toBe(0);
    expect(result.neighbourhoodRating).toBe(5);
  });

  it('throws ProviderError(PROVIDER_FAILURE) when there are zero hotel options', () => {
    const raw = baseRaw({ hotel_rates: [] });
    expect(() => normaliseRawHotelQuote(raw, 'synthetic-hotels-v1')).toThrow(ProviderError);
    try {
      normaliseRawHotelQuote(raw, 'synthetic-hotels-v1');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('PROVIDER_FAILURE');
    }
  });

  it('throws ProviderError(PROVIDER_FAILURE) on a structurally invalid raw payload', () => {
    const raw = baseRaw({ city_iata: '' });
    expect(() => normaliseRawHotelQuote(raw, 'synthetic-hotels-v1')).toThrow(ProviderError);
  });
});
