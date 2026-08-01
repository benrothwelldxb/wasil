import { useQuery } from "@tanstack/react-query";
import { fetchEventLive, type LiveMap } from "@/features/fpl";
import type { ApiError } from "@/services/api";

/**
 * Live per-player points for a gameweek, polled every 60s while mounted so the
 * score updates through match day. Disabled when no event is given.
 */
export function useEventLive(event: number | null) {
  return useQuery<LiveMap, ApiError>({
    queryKey: ["event-live", event],
    queryFn: ({ signal }) => fetchEventLive(event as number, signal),
    enabled: event !== null,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
