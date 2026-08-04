import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Journey, SearchCriteria } from '@/domain/types';
import type { JourneyProvider } from '@/data/provider/JourneyProvider';
import { criteriaKey } from '@/domain/url';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';

const getJourney = vi.fn<(id: string, c: SearchCriteria) => Promise<Journey | null>>();
const h = vi.hoisted(() => ({ provider: undefined as unknown as JourneyProvider }));
vi.mock('@/data/provider/provider-registry', () => ({
  getJourneyProvider: () => h.provider,
}));

import { useJourney } from './use-journey';

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

const searchResult = generateSearchResult(criteria);
const firstJourney = searchResult.journeys[0];

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useJourney', () => {
  it('resolves from the cached search result without calling the provider', async () => {
    getJourney.mockReset();
    h.provider = { id: 'fake', searchJourneys: async () => searchResult, getJourney };

    const client = makeClient();
    client.setQueryData(['journeys', criteriaKey(criteria)], searchResult);

    const { result } = renderHook(() => useJourney(firstJourney.id, criteria), {
      wrapper: wrapperWith(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(firstJourney.id);
    expect(getJourney).not.toHaveBeenCalled();
  });

  it('falls back to the provider on a cold cache', async () => {
    getJourney.mockReset();
    getJourney.mockResolvedValue(firstJourney);
    h.provider = { id: 'fake', searchJourneys: async () => searchResult, getJourney };

    const { result } = renderHook(() => useJourney(firstJourney.id, criteria), {
      wrapper: wrapperWith(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getJourney).toHaveBeenCalledWith(firstJourney.id, criteria);
    expect(result.current.data?.id).toBe(firstJourney.id);
  });

  it('returns null for an unknown journey id', async () => {
    getJourney.mockReset();
    getJourney.mockResolvedValue(null);
    h.provider = { id: 'fake', searchJourneys: async () => searchResult, getJourney };

    const { result } = renderHook(() => useJourney('does-not-exist', criteria), {
      wrapper: wrapperWith(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
