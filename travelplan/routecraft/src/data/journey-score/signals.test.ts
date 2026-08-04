import { describe, expect, it } from 'vitest';
import { haversineKm, estimateFlightMinutes } from '@/domain/geo';
import { getCity } from '@/data/datasets/cities';
import type {
  AirportRef,
  CostBreakdown,
  ExperienceScore,
  Journey,
  Leg,
  StopoverCity,
} from '@/domain/types';

import { buildJourneyScoreSignals } from './signals';

// ———— Minimal fixture builders (mirrors the pattern used by derive.test.ts) ————

const AIRPORTS: Record<string, AirportRef> = {
  DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
  MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
  IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
  ZZZ: { iata: 'ZZZ', cityName: 'Nowhere', countryCode: 'XX' },
};

function makeLeg(from: AirportRef, to: AirportRef, depart: string, arrive: string): Leg {
  const durationMinutes = (new Date(arrive).getTime() - new Date(depart).getTime()) / 60000;
  return {
    id: `leg-${from.iata}-${to.iata}`,
    from,
    to,
    departure: depart,
    arrival: arrive,
    durationMinutes,
    airline: { code: 'MR', name: 'Meridian Air', comfortRating: 4 },
    flightNumber: 'MR100',
    cabin: 'economy',
    aircraft: 'A350',
    isRedEye: false,
    pricePerPax: { amount: 400, currency: 'USD' },
  };
}

function makeStopover(airport: AirportRef, nights = 1): StopoverCity {
  return {
    airport,
    cityName: airport.cityName,
    countryCode: airport.countryCode,
    nights,
    appealScore: 75,
    tags: [],
    headline: `${airport.cityName} stopover`,
    highlights: [],
    hotel: {
      id: 'h1',
      name: 'Test Hotel',
      tier: 'midscale',
      starRating: 4,
      guestRating: 8.5,
      neighborhood: 'Test',
      pricePerNight: { amount: 100, currency: 'USD' },
      totalPrice: { amount: 100, currency: 'USD' },
      amenities: [],
    },
    alternativeHotels: [],
    transfers: {
      arrival: {
        id: 't-in',
        mode: 'metro',
        from: 'Airport',
        to: 'City',
        durationMinutes: 40,
        price: { amount: 25, currency: 'USD' },
        comfortRating: 3,
      },
      departure: {
        id: 't-out',
        mode: 'metro',
        from: 'City',
        to: 'Airport',
        durationMinutes: 40,
        price: { amount: 25, currency: 'USD' },
        comfortRating: 3,
      },
    },
  };
}

function makeJourney(legs: Leg[], stopovers: StopoverCity[]): Journey {
  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  const costBreakdown: CostBreakdown = {
    flights: { amount: 500, currency: 'USD' },
    hotels: { amount: 0, currency: 'USD' },
    transfers: { amount: 0, currency: 'USD' },
    total: { amount: 500, currency: 'USD' },
    perPerson: { amount: 500, currency: 'USD' },
    budget: { amount: 1500, currency: 'USD' },
    headroom: { amount: 1000, currency: 'USD' },
    headroomPct: 0.67,
  };

  const score: ExperienceScore = {
    total: 0,
    factors: {
      stopoverAppeal: 0,
      comfort: 0,
      travelTimeEfficiency: 0,
      layoverQuality: 0,
      valueForMoney: 0,
      scheduleConvenience: 0,
    },
    weights: {
      stopoverAppeal: 0.2,
      comfort: 0.2,
      travelTimeEfficiency: 0.2,
      layoverQuality: 0.2,
      valueForMoney: 0.1,
      scheduleConvenience: 0.1,
    },
    narrative: '',
  };

  return {
    id: 'journey-1',
    kind: stopovers.length > 0 ? 'stopover' : 'direct',
    criteria: {
      origin: legs[0].from.iata,
      destination: legs[legs.length - 1].to.iata,
      departureDate: '2026-09-15',
      pax: { adults: 1, children: 0 },
      budget: costBreakdown.budget,
      cabin: 'economy',
      preferences: [],
      maxStopovers: 2,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    },
    legs,
    stopovers,
    totalTravelTimeMinutes,
    doorToDoorMinutes: totalTravelTimeMinutes,
    cost: costBreakdown,
    score,
    badges: [],
  };
}

describe('buildJourneyScoreSignals', () => {
  it('DXB → IST → MAN: returns stopover signals aligned by index, plus a reference duration', () => {
    const journey = makeJourney(
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.IST, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z'),
        makeLeg(AIRPORTS.IST, AIRPORTS.MAN, '2026-09-16T10:00:00Z', '2026-09-16T14:00:00Z'),
      ],
      [makeStopover(AIRPORTS.IST, 1)],
    );

    const signals = buildJourneyScoreSignals(journey);

    expect(signals.stopovers).toHaveLength(journey.stopovers.length);

    const istSignals = signals.stopovers[0];
    const istCity = getCity('IST');
    expect(istCity).toBeDefined();
    expect(istSignals.touristAppeal).toBe(istCity?.appealScore);
    expect(istSignals.airportQuality).toBe((istCity?.hubStrength ?? 0) * 20);
    expect(typeof istSignals.safety).toBe('number');
    expect(typeof istSignals.neighbourhoodQuality).toBe('number');
    expect(typeof istSignals.weather).toBe('number');
    expect(typeof istSignals.foodRating).toBe('number');

    // origin signals
    const dxbCity = getCity('DXB');
    expect(signals.origin.airportQuality).toBe((dxbCity?.hubStrength ?? 0) * 20);

    // destination signals
    const manCity = getCity('MAN');
    expect(signals.destination.touristAppeal).toBe(manCity?.appealScore);

    // reference duration — great-circle DXB → MAN
    const expected = estimateFlightMinutes(haversineKm(dxbCity!, manCity!));
    expect(signals.referenceDurationMinutes).toBe(expected);
  });

  it('foodRating gets a bonus for cities tagged food/nightlife', () => {
    // IST is tagged ['culture', 'food'] in the dataset; its leg destination
    // becomes the journey's `criteria.destination`.
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.IST, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z')],
      [],
    );

    const signals = buildJourneyScoreSignals(journey);
    const istCity = getCity('IST');

    expect(signals.destination.foodRating).toBeGreaterThan(istCity!.appealScore);
  });

  it('degrades gracefully (no throw) for an unknown city', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.ZZZ, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z')],
      [makeStopover(AIRPORTS.ZZZ, 1)],
    );

    expect(() => buildJourneyScoreSignals(journey)).not.toThrow();

    const signals = buildJourneyScoreSignals(journey);
    expect(signals.destination).toEqual({});
    expect(signals.stopovers).toHaveLength(1);
    expect(signals.stopovers[0]).toEqual({});
    expect(signals.referenceDurationMinutes).toBeUndefined();
  });

  it('populates UTC offsets so the jet-lag factor has real data', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, '2026-09-15T09:00:00Z', '2026-09-15T15:00:00Z')],
      [],
    );

    const signals = buildJourneyScoreSignals(journey);
    expect(signals.origin.tzOffsetHours).toBe(4); // Dubai
    expect(signals.destination.tzOffsetHours).toBe(0); // Manchester
  });

  it('leaves tzOffsetHours undefined for a city with no curated offset', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.ZZZ, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z')],
      [],
    );
    const signals = buildJourneyScoreSignals(journey);
    expect(signals.destination.tzOffsetHours).toBeUndefined();
  });
});
