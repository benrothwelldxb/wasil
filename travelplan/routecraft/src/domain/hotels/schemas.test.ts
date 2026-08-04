import { describe, expect, it } from 'vitest';
import type { StopoverAccommodation } from './types';
import { stopoverAccommodationSchema } from './schemas';

function validFixture(): StopoverAccommodation {
  return {
    cityIata: 'IST',
    cityName: 'Istanbul',
    countryCode: 'TR',
    nights: 2,
    rooms: 1,
    hotels: [
      {
        id: 'hotel-1',
        name: 'Bosphorus View Hotel',
        tier: 'midscale',
        starRating: 4,
        guestRating: 8.4,
        neighborhood: 'Sultanahmet',
        pricePerNight: { amount: 120, currency: 'USD' },
        totalPrice: { amount: 240, currency: 'USD' },
        amenities: ['wifi', 'breakfast'],
      },
    ],
    averageNightlyPrice: { amount: 120, currency: 'USD' },
    totalAccommodationCost: { amount: 240, currency: 'USD' },
    walkingScore: 82,
    neighbourhoodRating: 4.2,
    safetyScore: 76,
    weather: {
      condition: 'sunny',
      averageHighC: 24,
      averageLowC: 15,
      precipitationChance: 0.1,
    },
    airportTransfer: {
      mode: 'metro',
      durationMinutes: 45,
      price: { amount: 20, currency: 'USD' },
      comfortRating: 4,
    },
    providerId: 'synthetic-hotel-provider',
  };
}

describe('stopoverAccommodationSchema', () => {
  it('accepts a valid StopoverAccommodation', () => {
    const result = stopoverAccommodationSchema.safeParse(validFixture());
    expect(result.success).toBe(true);
  });

  it('rejects walkingScore above 100', () => {
    const fixture = { ...validFixture(), walkingScore: 101 };
    const result = stopoverAccommodationSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it('rejects neighbourhoodRating above 5', () => {
    const fixture = { ...validFixture(), neighbourhoodRating: 5.5 };
    const result = stopoverAccommodationSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it('rejects precipitationChance above 1', () => {
    const fixture = {
      ...validFixture(),
      weather: { ...validFixture().weather, precipitationChance: 1.2 },
    };
    const result = stopoverAccommodationSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it('rejects an empty hotels array', () => {
    const fixture = { ...validFixture(), hotels: [] };
    const result = stopoverAccommodationSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });
});
