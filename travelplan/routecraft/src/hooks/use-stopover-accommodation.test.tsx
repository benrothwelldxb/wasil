import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StopoverAccommodation } from '@/domain/hotels';
import type { HotelSearchRequest } from '@/domain/hotels';

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
  providerId: 'synthetic-hotel-provider',
};

const h = vi.hoisted(() => ({
  getStopoverAccommodation: vi.fn<
    (req: HotelSearchRequest, opts?: { signal?: AbortSignal }) => Promise<StopoverAccommodation>
  >(),
}));

vi.mock('@/data/hotels', () => ({
  getStopoverAccommodation: h.getStopoverAccommodation,
}));

import { useStopoverAccommodation } from './use-stopover-accommodation';

const req: HotelSearchRequest = {
  cityIata: 'IST',
  nights: 2,
  pax: { adults: 2, children: 0 },
  date: '2026-09-15',
};

function wrapper({ children }: { children: ReactNode }) {
  // retryDelay: 0 keeps the hook's own `retry: 1` from delaying the error past
  // the waitFor timeout in the invalid-payload test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useStopoverAccommodation', () => {
  it('is disabled (idle) when req is null', () => {
    h.getStopoverAccommodation.mockResolvedValue(fixture);
    const { result } = renderHook(() => useStopoverAccommodation(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isPending).toBe(true);
    expect(h.getStopoverAccommodation).not.toHaveBeenCalled();
  });

  it('returns a validated StopoverAccommodation for a valid request', async () => {
    h.getStopoverAccommodation.mockResolvedValue(fixture);
    const { result } = renderHook(() => useStopoverAccommodation(req), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fixture);
    expect(h.getStopoverAccommodation).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('surfaces an error (never crashes) when the provider returns an invalid payload', async () => {
    // walkingScore out of range → fails stopoverAccommodationSchema in the hook.
    const invalid = { ...fixture, walkingScore: 999 } as StopoverAccommodation;
    h.getStopoverAccommodation.mockResolvedValue(invalid);
    const { result } = renderHook(() => useStopoverAccommodation(req), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
