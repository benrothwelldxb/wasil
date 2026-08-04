import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJourneyProvider } from '@/data/provider/provider-registry';
import { criteriaKey } from '@/domain/url';
import type { Journey, SearchCriteria, SearchResult } from '@/domain/types';

/**
 * Resolves a single journey. Prefers the cached search result (deep-link within
 * a session), and falls back to the provider re-deriving it deterministically
 * from the criteria in the URL (deep-link from a cold start).
 */
export function useJourney(journeyId: string, criteria: SearchCriteria | null) {
  const queryClient = useQueryClient();

  return useQuery<Journey | null>({
    queryKey: ['journey', journeyId, criteria ? criteriaKey(criteria) : 'none'],
    enabled: Boolean(journeyId) && criteria != null,
    staleTime: Infinity,
    queryFn: async () => {
      if (criteria) {
        const cached = queryClient.getQueryData<SearchResult>([
          'journeys',
          criteriaKey(criteria),
        ]);
        const hit = cached?.journeys.find((j) => j.id === journeyId);
        if (hit) return hit;
      }
      const provider = getJourneyProvider();
      return provider.getJourney(journeyId, criteria as SearchCriteria);
    },
  });
}
