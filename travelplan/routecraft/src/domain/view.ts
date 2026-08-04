/**
 * Pure client-side view derivation: filtering + sorting applied over the ranked
 * journeys from the provider. This never triggers a refetch — it only reshapes
 * what is already cached.
 */
import type { Journey } from './types';
import type { ResultFilters, SortMode } from '@/stores/ui-store';

export function filterJourneys(journeys: Journey[], filters: ResultFilters): Journey[] {
  return journeys.filter((j) => {
    if (j.stopovers.length > filters.maxStops) return false;
    if (j.score.total < filters.minScore) return false;
    if (filters.priceCeiling != null && j.cost.total.amount > filters.priceCeiling) return false;
    if (filters.excludeRedEye && j.legs.some((l) => l.isRedEye)) return false;
    return true;
  });
}

const SORTERS: Record<SortMode, (a: Journey, b: Journey) => number> = {
  experience: (a, b) => b.score.total - a.score.total,
  price: (a, b) => a.cost.total.amount - b.cost.total.amount,
  duration: (a, b) => a.totalTravelTimeMinutes - b.totalTravelTimeMinutes,
  value: (a, b) =>
    b.score.total / Math.max(1, b.cost.total.amount) -
    a.score.total / Math.max(1, a.cost.total.amount),
};

export function sortJourneys(journeys: Journey[], sort: SortMode): Journey[] {
  return [...journeys].sort((a, b) => {
    const primary = SORTERS[sort](a, b);
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
}

export function applyView(
  journeys: Journey[],
  filters: ResultFilters,
  sort: SortMode,
): Journey[] {
  return sortJourneys(filterJourneys(journeys, filters), sort);
}
