import { describe, expect, it } from 'vitest';
import { routeNodes } from './journey';
import type {
  AirportRef,
  CostBreakdown,
  ExperienceScore,
  HotelOption,
  Journey,
  Leg,
  StopoverCity,
  Transfer,
} from './types';

const AIRPORTS: Record<string, AirportRef> = {
  DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
  MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
  IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
  CDG: { iata: 'CDG', cityName: 'Paris', countryCode: 'FR' },
};

function makeLeg(from: AirportRef, to: AirportRef): Leg {
  return {
    id: `leg-${from.iata}-${to.iata}`,
    from,
    to,
    departure: '2026-09-15T09:00:00Z',
    arrival: '2026-09-15T13:00:00Z',
    durationMinutes: 240,
    airline: { code: 'MR', name: 'Meridian Air', comfortRating: 4 },
    flightNumber: 'MR100',
    cabin: 'economy',
    aircraft: 'A350',
    isRedEye: false,
    pricePerPax: { amount: 400, currency: 'USD' },
  };
}

function makeTransfer(id: string): Transfer {
  return {
    id,
    mode: 'metro',
    from: 'Airport',
    to: 'City',
    durationMinutes: 40,
    price: { amount: 25, currency: 'USD' },
    comfortRating: 3,
  };
}

function makeHotel(): HotelOption {
  return {
    id: 'h1',
    name: 'Test Hotel',
    tier: 'midscale',
    starRating: 4,
    guestRating: 8.5,
    neighborhood: 'Test',
    pricePerNight: { amount: 100, currency: 'USD' },
    totalPrice: { amount: 100, currency: 'USD' },
    amenities: [],
  };
}

function makeStopover(airport: AirportRef, nights: number): StopoverCity {
  return {
    airport,
    cityName: airport.cityName,
    countryCode: airport.countryCode,
    nights,
    appealScore: 75,
    tags: [],
    headline: `${airport.cityName} stopover`,
    highlights: [],
    hotel: makeHotel(),
    alternativeHotels: [],
    transfers: { arrival: makeTransfer('t-in'), departure: makeTransfer('t-out') },
  };
}

function makeJourney(legs: Leg[], stopovers: StopoverCity[]): Journey {
  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  const cost: CostBreakdown = {
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
      budget: cost.budget,
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
    cost,
    score,
    badges: [],
  };
}

describe('routeNodes', () => {
  it('direct journey: origin + destination, neither carries nights', () => {
    const journey = makeJourney([makeLeg(AIRPORTS.DXB, AIRPORTS.MAN)], []);

    const nodes = routeNodes(journey);

    expect(nodes).toEqual([
      { iata: 'DXB', kind: 'origin' },
      { iata: 'MAN', kind: 'destination' },
    ]);
  });

  it('single stopover: origin, one stopover with nights, destination', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.IST), makeLeg(AIRPORTS.IST, AIRPORTS.MAN)],
      [makeStopover(AIRPORTS.IST, 2)],
    );

    const nodes = routeNodes(journey);

    expect(nodes).toEqual([
      { iata: 'DXB', kind: 'origin' },
      { iata: 'IST', kind: 'stopover', nights: 2 },
      { iata: 'MAN', kind: 'destination' },
    ]);
  });

  it('multi-stopover: preserves order and each stopover keeps its own nights', () => {
    const journey = makeJourney(
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.IST),
        makeLeg(AIRPORTS.IST, AIRPORTS.CDG),
        makeLeg(AIRPORTS.CDG, AIRPORTS.MAN),
      ],
      [makeStopover(AIRPORTS.IST, 1), makeStopover(AIRPORTS.CDG, 3)],
    );

    const nodes = routeNodes(journey);

    expect(nodes).toEqual([
      { iata: 'DXB', kind: 'origin' },
      { iata: 'IST', kind: 'stopover', nights: 1 },
      { iata: 'CDG', kind: 'stopover', nights: 3 },
      { iata: 'MAN', kind: 'destination' },
    ]);
  });

  it('origin and destination nodes never carry a `nights` key', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.IST), makeLeg(AIRPORTS.IST, AIRPORTS.MAN)],
      [makeStopover(AIRPORTS.IST, 1)],
    );

    const nodes = routeNodes(journey);

    expect(nodes[0].nights).toBeUndefined();
    expect(nodes[nodes.length - 1].nights).toBeUndefined();
  });
});
