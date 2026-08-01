import { QueryClient } from "@tanstack/react-query";

/**
 * Application-wide TanStack Query client.
 *
 * Defaults are tuned for a data-heavy app: reasonable stale times to avoid
 * over-fetching, a single retry, and no refetch-on-focus storm. Feature code
 * can override any of these per-query.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 minute
        gcTime: 5 * 60_000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/** Shared singleton query client instance. */
export const queryClient = createQueryClient();
