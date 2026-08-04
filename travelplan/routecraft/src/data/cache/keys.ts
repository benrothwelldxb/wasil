import type { SearchCriteria } from '@/domain/types';
import { criteriaKey } from '@/domain/url';

/**
 * Builds a stable cache key for a search performed against a specific
 * adapter, combining the adapter's id with the canonical criteria key.
 */
export function searchCacheKey(adapterId: string, criteria: SearchCriteria): string {
  return `${adapterId}::${criteriaKey(criteria)}`;
}
