import { useQuery } from '@tanstack/react-query';
import { getJourneyProvider } from '@/data/provider/provider-registry';
import { journeySchema, searchResultSchema } from '@/domain/schemas';
import { criteriaKey } from '@/domain/url';
import { log } from '@/lib/logger';
import type { SearchCriteria, SearchResult } from '@/domain/types';

const THIRTY_MIN = 30 * 60 * 1000;
const logger = log.child('journey-search');

/**
 * Runs a journey search through the provider. Cache key is the canonical
 * criteria string so equivalent searches (any property order) share one entry.
 * Data is deterministic, so it never goes stale.
 */
export function useJourneySearch(criteria: SearchCriteria | null) {
  return useQuery<SearchResult>({
    queryKey: ['journeys', criteria ? criteriaKey(criteria) : 'none'],
    enabled: criteria != null,
    staleTime: Infinity,
    gcTime: THIRTY_MIN,
    retry: 1,
    queryFn: async ({ signal }) => {
      const provider = getJourneyProvider();
      const result = await provider.searchJourneys(criteria as SearchCriteria, { signal });

      const parsed = searchResultSchema.safeParse(result);
      if (parsed.success) return parsed.data;

      // Drop individually-invalid journeys rather than failing hard.
      const journeys = result.journeys.filter((j) => journeySchema.safeParse(j).success);
      const count = result.journeys.length - journeys.length;
      logger.warn('dropped invalid journeys from provider output', { count });
      return { ...result, journeys };
    },
  });
}
