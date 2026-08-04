import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AirportRef,
  CostBreakdown,
  ExperienceScore,
  HotelOption,
  Journey,
  Leg,
  StopoverCity,
} from '@/domain/types';
import { renderWithProviders, screen } from '@/test/render';
import { expectNoA11yViolations } from '@/test/a11y';

// ———— Fixture data — mirrors the shape used by RouteMap.test.tsx ————

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

const HOTEL: HotelOption = {
  id: 'hotel-1',
  name: 'Bosphorus Boutique Hotel',
  tier: 'midscale',
  starRating: 4,
  guestRating: 8.6,
  neighborhood: 'Sultanahmet',
  pricePerNight: { amount: 120, currency: 'USD' },
  totalPrice: { amount: 120, currency: 'USD' },
  amenities: ['wifi'],
};

function makeStopover(): StopoverCity {
  return {
    airport: AIRPORTS.IST,
    cityName: AIRPORTS.IST.cityName,
    countryCode: AIRPORTS.IST.countryCode,
    nights: 1,
    appealScore: 90,
    tags: ['culture'],
    headline: 'Istanbul stopover',
    highlights: [
      'Sunrise over the Bosphorus from a ferry deck',
      'Hagia Sophia and the Blue Mosque a courtyard apart',
      'Meze crawl through the backstreets of Karaköy',
    ],
    hotel: HOTEL,
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

function makeJourney(legs: Leg[], stopovers: StopoverCity[] = []): Journey {
  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  return {
    id: 'journey-1',
    kind: stopovers.length > 0 ? 'stopover' : 'direct',
    criteria: {
      origin: legs[0].from.iata,
      destination: legs[legs.length - 1].to.iata,
      departureDate: '2026-06-15',
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
    badges: ['best-value'],
  };
}

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: analytics.track }));

import { JourneyCard } from './JourneyCard';

describe('JourneyCard', () => {
  beforeEach(() => {
    analytics.track.mockClear();
  });

  describe('stopover journey', () => {
    const journey = makeJourney(
      [makeLeg(AIRPORTS.DXB, AIRPORTS.IST), makeLeg(AIRPORTS.IST, AIRPORTS.MAN)],
      [makeStopover()],
    );

    it('renders the featured stopover city name', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText('Istanbul')).toBeInTheDocument();
    });

    it('renders the total price', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText('$850')).toBeInTheDocument();
    });

    it('renders the experience score ring', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByRole('img', { name: 'Journey score 80 out of 100' })).toBeInTheDocument();
    });

    it('renders the stat pills', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText(/You save \$650/)).toBeInTheDocument();
      expect(screen.getByText('Economy')).toBeInTheDocument();
      expect(screen.getByText('8h flying')).toBeInTheDocument();
    });

    it('renders the mini timeline', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('shows the hotel preview', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText('Bosphorus Boutique Hotel')).toBeInTheDocument();
    });

    it('fires journey_selected on click', async () => {
      const { user } = renderWithProviders(<JourneyCard journey={journey} rank={2} />);
      await user.click(screen.getByRole('link'));
      expect(analytics.track).toHaveBeenCalledWith({
        name: 'journey_selected',
        journeyId: 'journey-1',
        rank: 2,
        kind: 'stopover',
        score: 80,
        badges: ['best-value'],
      });
    });

    it('is axe-clean', async () => {
      const { container } = renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      await expectNoA11yViolations(container);
    });
  });

  describe('direct journey', () => {
    const journey = makeJourney([makeLeg(AIRPORTS.DXB, AIRPORTS.MAN)], []);

    it('renders the featured destination city name', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText('Manchester')).toBeInTheDocument();
    });

    it('shows the "no overnight stay" line instead of a hotel', () => {
      renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      expect(screen.getByText(/Direct — no overnight stay/)).toBeInTheDocument();
      expect(screen.queryByText('Bosphorus Boutique Hotel')).not.toBeInTheDocument();
    });

    it('fires journey_selected with kind "direct" on click', async () => {
      const { user } = renderWithProviders(<JourneyCard journey={journey} rank={4} />);
      await user.click(screen.getByRole('link'));
      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'journey_selected', kind: 'direct', rank: 4 }),
      );
    });

    it('is axe-clean', async () => {
      const { container } = renderWithProviders(<JourneyCard journey={journey} rank={0} />);
      await expectNoA11yViolations(container);
    });
  });
});
