import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { render } from '@/test/render';
import type { AirportRef, CostBreakdown, ExperienceScore, Journey, Leg } from '@/domain/types';
import { RouteMap } from './RouteMap';

// ———— Minimal Journey fixture — only `legs[].from/to.iata` and
// `stopovers[].airport.iata` are read by RouteMap, but the strict `Journey`
// type still requires every field to be present. ————

const AIRPORTS: Record<string, AirportRef> = {
  DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
  IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
  MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
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

const COST: CostBreakdown = {
  flights: { amount: 700, currency: 'USD' },
  hotels: { amount: 100, currency: 'USD' },
  transfers: { amount: 50, currency: 'USD' },
  total: { amount: 850, currency: 'USD' },
  perPerson: { amount: 850, currency: 'USD' },
  budget: { amount: 1500, currency: 'USD' },
  headroom: { amount: 650, currency: 'USD' },
  headroomPct: 0.43,
};

const SCORE: ExperienceScore = {
  total: 80,
  factors: {
    stopoverAppeal: 80,
    comfort: 80,
    travelTimeEfficiency: 80,
    layoverQuality: 80,
    valueForMoney: 80,
    scheduleConvenience: 80,
  },
  weights: {
    stopoverAppeal: 0.2,
    comfort: 0.2,
    travelTimeEfficiency: 0.2,
    layoverQuality: 0.2,
    valueForMoney: 0.1,
    scheduleConvenience: 0.1,
  },
  narrative: 'A pleasant journey.',
};

function makeJourney(legs: Leg[], stopoverAirports: AirportRef[]): Journey {
  const stopovers = stopoverAirports.map((airport) => ({
    airport,
    cityName: airport.cityName,
    countryCode: airport.countryCode,
    nights: 1,
    appealScore: 75,
    tags: [],
    headline: `${airport.cityName} stopover`,
    highlights: [],
    hotel: {
      id: 'h1',
      name: 'Test Hotel',
      tier: 'midscale' as const,
      starRating: 4 as const,
      guestRating: 8.5,
      neighborhood: 'Test',
      pricePerNight: { amount: 100, currency: 'USD' as const },
      totalPrice: { amount: 100, currency: 'USD' as const },
      amenities: [],
    },
    alternativeHotels: [],
    transfers: {
      arrival: {
        id: 't-in',
        mode: 'metro' as const,
        from: 'Airport',
        to: 'City',
        durationMinutes: 40,
        price: { amount: 25, currency: 'USD' as const },
        comfortRating: 3,
      },
      departure: {
        id: 't-out',
        mode: 'metro' as const,
        from: 'City',
        to: 'Airport',
        durationMinutes: 40,
        price: { amount: 25, currency: 'USD' as const },
        comfortRating: 3,
      },
    },
  }));

  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  return {
    id: 'journey-1',
    kind: stopovers.length > 0 ? 'stopover' : 'direct',
    criteria: {
      origin: legs[0].from.iata,
      destination: legs[legs.length - 1].to.iata,
      departureDate: '2026-09-15',
      pax: { adults: 1, children: 0 },
      budget: COST.budget,
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
    cost: COST,
    score: SCORE,
    badges: [],
  };
}

describe('RouteMap', () => {
  it('renders a route map with a descriptive label for a stopover journey', async () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.IST), makeLeg(AIRPORTS.IST, AIRPORTS.MAN)],
      [AIRPORTS.IST],
    );

    const { container } = render(<RouteMap journey={journey} />);

    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-label', 'Route map: DXB to IST to MAN');
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders a route map for a direct journey with no stopovers', async () => {
    const journey = makeJourney([makeLeg(AIRPORTS.DXB, AIRPORTS.MAN)], []);

    const { container } = render(<RouteMap journey={journey} />);

    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-label', 'Route map: DXB to MAN');
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
