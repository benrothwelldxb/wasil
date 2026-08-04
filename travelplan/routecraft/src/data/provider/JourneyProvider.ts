/**
 * The provider seam. Everything above the data layer depends only on this
 * interface, so the synthetic engine can be swapped for a real API later with
 * no changes upstream.
 */
import type { Journey, SearchCriteria, SearchResult } from '@/domain/types';

export interface JourneyProvider {
  readonly id: string;
  searchJourneys(criteria: SearchCriteria, opts?: { signal?: AbortSignal }): Promise<SearchResult>;
  getJourney(journeyId: string, criteria: SearchCriteria): Promise<Journey | null>;
}
