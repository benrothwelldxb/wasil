import { describe, expect, it } from 'vitest';
import type { Journey } from './types';
import { DEFAULT_FILTERS } from '@/stores/ui-store';
import { applyView, filterJourneys, sortJourneys } from './view';

function stubJourney(over: {
  id: string;
  stops: number;
  score: number;
  total: number;
  time: number;
  redEye?: boolean;
}): Journey {
  return {
    id: over.id,
    kind: over.stops > 0 ? 'stopover' : 'direct',
    criteria: {
      origin: 'DXB',
      destination: 'MAN',
      departureDate: '2026-09-15',
      pax: { adults: 1, children: 0 },
      budget: { amount: 2000, currency: 'USD' },
      cabin: 'economy',
      preferences: [],
      maxStopovers: 2,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    },
    legs: [
      {
        id: `${over.id}-l1`,
        from: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
        to: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
        departure: '2026-09-15T09:00:00Z',
        arrival: '2026-09-15T16:00:00Z',
        durationMinutes: over.time,
        airline: { code: 'MR', name: 'Meridian', comfortRating: 4 },
        flightNumber: 'MR1',
        cabin: 'economy',
        aircraft: 'A350',
        isRedEye: over.redEye ?? false,
        pricePerPax: { amount: over.total, currency: 'USD' },
      },
    ],
    stopovers: Array.from({ length: over.stops }, (_, i) => ({
      airport: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
      cityName: 'Istanbul',
      countryCode: 'TR',
      nights: 1,
      appealScore: 90,
      tags: ['culture'],
      headline: 'h',
      highlights: ['a'],
      hotel: {
        id: `${over.id}-h${i}`,
        name: 'Hotel',
        tier: 'midscale',
        starRating: 4,
        guestRating: 8,
        neighborhood: 'Old Town',
        pricePerNight: { amount: 100, currency: 'USD' },
        totalPrice: { amount: 100, currency: 'USD' },
        amenities: [],
      },
      alternativeHotels: [],
      transfers: {
        arrival: { id: 't1', mode: 'train', from: 'A', to: 'B', durationMinutes: 40, price: { amount: 20, currency: 'USD' }, comfortRating: 4 },
        departure: { id: 't2', mode: 'train', from: 'B', to: 'A', durationMinutes: 40, price: { amount: 20, currency: 'USD' }, comfortRating: 4 },
      },
    })),
    totalTravelTimeMinutes: over.time,
    doorToDoorMinutes: over.time,
    cost: {
      flights: { amount: over.total, currency: 'USD' },
      hotels: { amount: 0, currency: 'USD' },
      transfers: { amount: 0, currency: 'USD' },
      total: { amount: over.total, currency: 'USD' },
      perPerson: { amount: over.total, currency: 'USD' },
      budget: { amount: 2000, currency: 'USD' },
      headroom: { amount: 2000 - over.total, currency: 'USD' },
      headroomPct: (2000 - over.total) / 2000,
    },
    score: {
      total: over.score,
      factors: {
        stopoverAppeal: 0,
        comfort: 0,
        travelTimeEfficiency: 0,
        layoverQuality: 0,
        valueForMoney: 0,
        scheduleConvenience: 0,
      },
      weights: {
        stopoverAppeal: 0.25,
        comfort: 0.2,
        travelTimeEfficiency: 0.2,
        layoverQuality: 0.15,
        valueForMoney: 0.1,
        scheduleConvenience: 0.1,
      },
      narrative: '',
    },
    badges: [],
  };
}

const journeys: Journey[] = [
  stubJourney({ id: 'a', stops: 0, score: 70, total: 800, time: 450, redEye: true }),
  stubJourney({ id: 'b', stops: 1, score: 88, total: 1200, time: 600 }),
  stubJourney({ id: 'c', stops: 2, score: 60, total: 500, time: 900 }),
];

describe('filterJourneys', () => {
  it('filters by max stops', () => {
    const r = filterJourneys(journeys, { ...DEFAULT_FILTERS, maxStops: 1 });
    expect(r.map((j) => j.id)).toEqual(['a', 'b']);
  });
  it('filters by min score and price ceiling', () => {
    const r = filterJourneys(journeys, { ...DEFAULT_FILTERS, minScore: 65, priceCeiling: 1000 });
    expect(r.map((j) => j.id)).toEqual(['a']);
  });
  it('excludes red-eye when asked', () => {
    const r = filterJourneys(journeys, { ...DEFAULT_FILTERS, excludeRedEye: true });
    expect(r.map((j) => j.id)).toEqual(['b', 'c']);
  });
});

describe('sortJourneys', () => {
  it('sorts by experience, price, and duration', () => {
    expect(sortJourneys(journeys, 'experience').map((j) => j.id)).toEqual(['b', 'a', 'c']);
    expect(sortJourneys(journeys, 'price').map((j) => j.id)).toEqual(['c', 'a', 'b']);
    expect(sortJourneys(journeys, 'duration').map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('applyView', () => {
  it('filters then sorts without mutating input', () => {
    const before = journeys.map((j) => j.id);
    const r = applyView(journeys, { ...DEFAULT_FILTERS, maxStops: 1 }, 'price');
    expect(r.map((j) => j.id)).toEqual(['a', 'b']);
    expect(journeys.map((j) => j.id)).toEqual(before);
  });
});
