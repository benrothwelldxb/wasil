/**
 * Query-key factory for the FPL feature.
 *
 * Centralising keys guarantees consistency and enables targeted cache
 * invalidation (e.g. `queryClient.invalidateQueries({ queryKey: fplKeys.all })`).
 *
 * Crucially, **every** derived selector (players, teams, positions, prices)
 * reads from the SAME `bootstrap` key. TanStack Query deduplicates concurrent
 * observers of an identical key onto a single network request — so no matter
 * how many of these hooks are mounted, the bootstrap endpoint is fetched once.
 */
export const fplKeys = {
  all: ["fpl"] as const,
  bootstrap: () => [...fplKeys.all, "bootstrap"] as const,
  fixtures: (event?: number) =>
    [...fplKeys.all, "fixtures", { event: event ?? "all" }] as const,
} as const;

export type FplQueryKey =
  | ReturnType<typeof fplKeys.bootstrap>
  | ReturnType<typeof fplKeys.fixtures>;
