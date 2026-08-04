/**
 * Serialise a canonical SearchCriteria to URL search params. The inverse
 * (params → criteria) lives in `searchParamsSchema` in schemas.ts. The URL is
 * the single source of truth for a committed search.
 */
import type { SearchCriteria } from './types';

export function criteriaToSearchParams(criteria: SearchCriteria): URLSearchParams {
  const params = new URLSearchParams();
  params.set('origin', criteria.origin);
  params.set('destination', criteria.destination);
  params.set('departureDate', criteria.departureDate);
  if (criteria.returnDate) params.set('returnDate', criteria.returnDate);
  params.set('adults', String(criteria.pax.adults));
  params.set('children', String(criteria.pax.children));
  params.set('budget', String(criteria.budget.amount));
  params.set('cabin', criteria.cabin);
  if (criteria.preferences.length > 0) {
    params.set('preferences', criteria.preferences.join(','));
  }
  params.set('maxStopovers', String(criteria.maxStopovers));
  params.set('maxStopoverNights', String(criteria.maxStopoverNights));
  return params;
}

export function criteriaToResultsPath(criteria: SearchCriteria): string {
  return `/results?${criteriaToSearchParams(criteria).toString()}`;
}

export function criteriaToJourneyPath(journeyId: string, criteria: SearchCriteria): string {
  return `/journeys/${encodeURIComponent(journeyId)}?${criteriaToSearchParams(criteria).toString()}`;
}

/**
 * A stable string key for a criteria object, independent of property order —
 * used as the TanStack Query cache key so equivalent searches share a cache
 * entry.
 */
export function criteriaKey(criteria: SearchCriteria): string {
  return criteriaToSearchParams(criteria).toString();
}
