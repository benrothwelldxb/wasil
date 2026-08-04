import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { StopoverAccommodation } from '@/domain/hotels';

const fixture: StopoverAccommodation = {
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
  providerId: 'super-secret-provider-id',
};

const h = vi.hoisted(() => ({
  useStopoverAccommodation: vi.fn(),
}));

vi.mock('@/hooks/use-stopover-accommodation', () => ({
  useStopoverAccommodation: h.useStopoverAccommodation,
}));

import { StopoverInsights } from './StopoverInsights';

const props = {
  cityIata: 'IST',
  cityName: 'Istanbul',
  nights: 2,
  pax: { adults: 2, children: 0 },
  date: '2026-09-15',
};

function loadingResult() {
  return { isLoading: true, isError: false, isSuccess: false, data: undefined };
}

function successResult(data: StopoverAccommodation) {
  return { isLoading: false, isError: false, isSuccess: true, data };
}

function errorResult() {
  return { isLoading: false, isError: true, isSuccess: false, data: undefined };
}

describe('StopoverInsights', () => {
  it('renders skeletons while loading', () => {
    h.useStopoverAccommodation.mockReturnValue(loadingResult());
    render(<StopoverInsights {...props} />);
    expect(screen.getByTestId('insights-skeleton')).toBeInTheDocument();
  });

  it('renders the muted fallback on error without throwing', () => {
    h.useStopoverAccommodation.mockReturnValue(errorResult());
    render(<StopoverInsights {...props} />);
    expect(screen.getByText('Insights unavailable.')).toBeInTheDocument();
  });

  it('renders all seven metrics on success', () => {
    h.useStopoverAccommodation.mockReturnValue(successResult(fixture));
    render(<StopoverInsights {...props} />);

    expect(screen.getByText('Avg. hotel price')).toBeInTheDocument();
    expect(screen.getByText('$120')).toBeInTheDocument();

    expect(screen.getByText('Walking score')).toBeInTheDocument();
    expect(screen.getByText('82/100')).toBeInTheDocument();

    expect(screen.getByText('Airport transfer')).toBeInTheDocument();
    expect(screen.getByText('Metro')).toBeInTheDocument();
    expect(screen.getByText('45m')).toBeInTheDocument();

    expect(screen.getByText('Neighbourhood')).toBeInTheDocument();
    expect(screen.getByText('4.2/5')).toBeInTheDocument();

    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('76/100')).toBeInTheDocument();

    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.getByText('Sunny')).toBeInTheDocument();
    expect(screen.getByText('24° / 15°C')).toBeInTheDocument();

    expect(screen.getByText('Total accommodation')).toBeInTheDocument();
    expect(screen.getByText('$240')).toBeInTheDocument();
  });

  it('never renders the provider id', () => {
    h.useStopoverAccommodation.mockReturnValue(successResult(fixture));
    render(<StopoverInsights {...props} />);
    expect(screen.queryByText(/super-secret-provider-id/)).not.toBeInTheDocument();
  });

  it('has no detectable accessibility violations when loaded', async () => {
    h.useStopoverAccommodation.mockReturnValue(successResult(fixture));
    const { container } = render(<StopoverInsights {...props} />);
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
