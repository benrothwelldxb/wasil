import type { UseQueryOptions } from "@tanstack/react-query";

/**
 * Shared query behaviour for the FPL data layer.
 *
 * These options implement the data-layer requirements:
 * - **caching** — `staleTime` keeps data fresh without refetching; `gcTime`
 *   controls how long unused data lingers in cache.
 * - **retries** — failed requests retry with capped exponential backoff.
 * - **automatic refresh** — `refetchInterval` polls in the background and
 *   `refetchOnWindowFocus` refreshes when the user returns to the tab.
 *
 * (Request de-duplication is handled by TanStack automatically for any
 * observers that share a query key — see `queryKeys.ts`.)
 */

const retryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 30_000);

/** Bootstrap changes slowly (prices update ~once/day) — poll gently. */
export const BOOTSTRAP_QUERY_CONFIG = {
  staleTime: 5 * 60_000, // 5 minutes
  gcTime: 24 * 60 * 60_000, // 24 hours — kept for offline / persisted cache
  retry: 2,
  retryDelay,
  refetchInterval: 10 * 60_000, // 10 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} satisfies Partial<UseQueryOptions>;

/** Fixtures carry live scores — poll more frequently. */
export const FIXTURES_QUERY_CONFIG = {
  staleTime: 60_000, // 1 minute
  gcTime: 6 * 60 * 60_000, // 6 hours — kept for offline / persisted cache
  retry: 2,
  retryDelay,
  refetchInterval: 60_000, // 1 minute
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} satisfies Partial<UseQueryOptions>;
