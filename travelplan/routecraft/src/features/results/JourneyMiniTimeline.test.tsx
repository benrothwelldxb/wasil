import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';
import type { AirportRef, CostBreakdown, ExperienceScore, Journey, Leg, StopoverCity } from '@/domain/types';
import { JourneyMiniTimeline } from './JourneyMiniTimeline';

const AIRPORTS: Record<string, AirportRef> = {
  DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
  MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
  IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
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

const SCORE: ExperienceScore = {
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

function makeJourney({ withStopover }: { withStopover: boolean }): Journey {
  const legs = withStopover
    ? [
        makeLeg(AIRPORTS.DXB, AIRPORTS.IST, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z'),
        makeLeg(AIRPORTS.IST, AIRPORTS.MAN, '2026-09-16T10:00:00Z', '2026-09-16T14:00:00Z'),
      ]
    : [makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, '2026-09-15T09:00:00Z', '2026-09-15T16:00:00Z')];
  const stopovers = withStopover ? [makeStopover(AIRPORTS.IST, 1)] : [];
  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  return {
    id: 'journey-1',
    kind: withStopover ? 'stopover' : 'direct',
    criteria: {
      origin: 'DXB',
      destination: 'MAN',
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

describe('JourneyMiniTimeline', () => {
  it('shows origin, stopover (with nights), and destination markers for a stopover journey', () => {
    render(<JourneyMiniTimeline journey={makeJourney({ withStopover: true })} />);
    expect(screen.getByText('DXB')).toBeInTheDocument();
    expect(screen.getByText('IST')).toBeInTheDocument();
    expect(screen.getByText('MAN')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('summarises the routing in an aria-label including the stopover nights', () => {
    render(<JourneyMiniTimeline journey={makeJourney({ withStopover: true })} />);
    const group = screen.getByRole('group');
    expect(group).toHaveAccessibleName(/DXB.*IST.*1 night stopover.*MAN/s);
  });

  it('shows only origin and destination markers for a direct journey', () => {
    render(<JourneyMiniTimeline journey={makeJourney({ withStopover: false })} />);
    expect(screen.getByText('DXB')).toBeInTheDocument();
    expect(screen.getByText('MAN')).toBeInTheDocument();
    expect(screen.queryByText('IST')).not.toBeInTheDocument();
  });

  it('summarises a direct routing without stopover language', () => {
    render(<JourneyMiniTimeline journey={makeJourney({ withStopover: false })} />);
    const group = screen.getByRole('group');
    expect(group).toHaveAccessibleName('Route: DXB to MAN');
  });

  it('is axe-clean', async () => {
    const { container } = render(<JourneyMiniTimeline journey={makeJourney({ withStopover: true })} />);
    await expectNoA11yViolations(container);
  });
});
