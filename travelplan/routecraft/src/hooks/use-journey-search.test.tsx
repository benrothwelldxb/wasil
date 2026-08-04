import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SearchCriteria } from '@/domain/types';
import type { JourneyProvider } from '@/data/provider/JourneyProvider';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';

// Mutable provider double, injected via a hoisted ref so vi.mock can see it.
const h = vi.hoisted(() => ({ provider: undefined as unknown as JourneyProvider }));
vi.mock('@/data/provider/provider-registry', () => ({
  getJourneyProvider: () => h.provider,
}));

import { useJourneySearch } from './use-journey-search';

const criteria: SearchCriteria = {
  origin: 'DXB',
  destination: 'MAN',
  departureDate: '2026-09-15',
  pax: { adults: 1, children: 0 },
  budget: { amount: 2500, currency: 'USD' },
  cabin: 'economy',
  preferences: ['culture'],
  maxStopovers: 2,
  minStopoverNights: 1,
  maxStopoverNights: 2,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useJourneySearch', () => {
  beforeEach(() => {
    h.provider = {
      id: 'fake',
      searchJourneys: async (c) => generateSearchResult(c),
      getJourney: async () => null,
    };
  });

  it('is disabled (idle) when criteria is null', () => {
    const { result } = renderHook(() => useJourneySearch(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isPending).toBe(true);
  });

  it('returns a validated SearchResult for valid criteria', async () => {
    const { result } = renderHook(() => useJourneySearch(criteria), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.journeys.length).toBeGreaterThan(0);
    expect(result.current.data!.criteria.origin).toBe('DXB');
  });

  it('drops individually-invalid journeys when the whole result fails validation', async () => {
    const base = generateSearchResult(criteria);
    expect(base.journeys.length).toBeGreaterThan(1);
    // Corrupt the first journey (empty legs violates legSchema.min(1)), which
    // makes the whole-result parse fail and exercises the per-journey drop path.
    const corrupted = {
      ...base,
      journeys: [{ ...base.journeys[0], legs: [] }, ...base.journeys.slice(1)],
    };
    h.provider = {
      id: 'fake',
      searchJourneys: async () => corrupted,
      getJourney: async () => null,
    };

    const { result } = renderHook(() => useJourneySearch(criteria), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The corrupted journey is dropped; the valid siblings survive.
    expect(result.current.data!.journeys).toHaveLength(base.journeys.length - 1);
    expect(result.current.data!.journeys.every((j) => j.legs.length > 0)).toBe(true);
  });
});
