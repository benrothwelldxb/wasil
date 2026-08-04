import { act } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { DEFAULT_JOURNEY_SCORE_WEIGHTS, JOURNEY_SCORE_FACTOR_LABELS } from '@/domain/journey-score';
import type {
  AirportRef,
  CostBreakdown,
  ExperienceScore,
  Journey,
  Leg,
  StopoverCity,
} from '@/domain/types';

import { useJourneyScoreStore } from '@/stores/journey-score-store';
import { JourneyScorePanel } from './JourneyScorePanel';

// ———— Fixture: a DXB → IST → MAN stopover journey (real, dataset-backed cities) ————

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

function makeStopover(airport: AirportRef): StopoverCity {
  return {
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

function makeJourney(): Journey {
  const legs = [
    makeLeg(AIRPORTS.DXB, AIRPORTS.IST, '2026-09-15T09:00:00Z', '2026-09-15T13:00:00Z'),
    makeLeg(AIRPORTS.IST, AIRPORTS.MAN, '2026-09-16T10:00:00Z', '2026-09-16T14:00:00Z'),
  ];
  const stopovers = [makeStopover(AIRPORTS.IST)];
  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  const costBreakdown: CostBreakdown = {
    flights: { amount: 700, currency: 'USD' },
    hotels: { amount: 100, currency: 'USD' },
    transfers: { amount: 50, currency: 'USD' },
    total: { amount: 850, currency: 'USD' },
    perPerson: { amount: 850, currency: 'USD' },
    budget: { amount: 1500, currency: 'USD' },
    headroom: { amount: 650, currency: 'USD' },
    headroomPct: 0.43,
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
    kind: 'stopover',
    criteria: {
      origin: 'DXB',
      destination: 'MAN',
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

// Reset in `beforeEach` only (never `afterEach`): a previous test's render
// tree is still mounted until Testing Library's own `afterEach(cleanup)`
// runs, so mutating the store's state after a test — while its subscribed
// component may still be alive — trips React's "not wrapped in act" warning.
function resetStore() {
  window.localStorage.clear();
  useJourneyScoreStore.setState({ importances: { ...DEFAULT_JOURNEY_SCORE_WEIGHTS } });
}

beforeEach(() => {
  resetStore();
});

describe('JourneyScorePanel', () => {
  it('renders a numeric composite total', () => {
    render(<JourneyScorePanel journey={makeJourney()} />);

    const total = screen.getByTestId('journey-score-total');
    expect(Number(total.textContent)).not.toBeNaN();
    const value = Number(total.textContent);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('shows factor labels in the breakdown', () => {
    render(<JourneyScorePanel journey={makeJourney()} />);

    const breakdown = screen.getByLabelText('Score breakdown by factor');
    expect(within(breakdown).getByText(JOURNEY_SCORE_FACTOR_LABELS.cost)).toBeInTheDocument();
    expect(
      within(breakdown).getByText(JOURNEY_SCORE_FACTOR_LABELS.cabinQuality),
    ).toBeInTheDocument();
    expect(
      within(breakdown).getByText(JOURNEY_SCORE_FACTOR_LABELS.touristAppeal),
    ).toBeInTheDocument();
    // Every factor is labelled in the breakdown, including jet lag (now backed
    // by curated UTC offsets for the dataset cities).
    const jetLagRow = within(breakdown)
      .getByText(JOURNEY_SCORE_FACTOR_LABELS.jetLag)
      .closest('li');
    expect(jetLagRow).not.toBeNull();
  });

  it('moving a slider recomputes the total live', async () => {
    render(<JourneyScorePanel journey={makeJourney()} />);

    const before = Number(screen.getByTestId('journey-score-total').textContent);

    await act(async () => {
      screen.getByRole('button', { name: 'Adjust weighting' }).click();
    });

    const costSlider = screen.getByRole('slider', { name: /Cost importance/i });
    await act(async () => {
      fireEvent.keyDown(costSlider, { key: 'End' });
    });

    const after = Number(screen.getByTestId('journey-score-total').textContent);
    expect(after).not.toBe(before);
  });

  it('setting an importance directly through the store updates the displayed total', () => {
    render(<JourneyScorePanel journey={makeJourney()} />);
    const before = Number(screen.getByTestId('journey-score-total').textContent);

    act(() => {
      useJourneyScoreStore.getState().setImportance('cost', 50);
    });

    const after = Number(screen.getByTestId('journey-score-total').textContent);
    expect(after).not.toBe(before);
  });

  it('Reset restores the default-weighted total', async () => {
    render(<JourneyScorePanel journey={makeJourney()} />);
    const initial = screen.getByTestId('journey-score-total').textContent;

    act(() => {
      useJourneyScoreStore.getState().setImportance('cost', 50);
    });
    expect(screen.getByTestId('journey-score-total').textContent).not.toBe(initial);

    await act(async () => {
      screen.getByRole('button', { name: 'Adjust weighting' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Reset' }).click();
    });

    expect(screen.getByTestId('journey-score-total').textContent).toBe(initial);
    expect(useJourneyScoreStore.getState().importances).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);
  });

  it('has no detectable accessibility violations when loaded', async () => {
    const { container } = render(<JourneyScorePanel journey={makeJourney()} />);
    await act(async () => {
      screen.getByRole('button', { name: 'Adjust weighting' }).click();
    });

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
