import { useMemo } from "react";
import { useBootstrap, usePlayers } from "@/features/fpl";
import type { ApiError } from "@/services/api";
import { priceWatch, type PriceWatch } from "./predict";

export interface UsePriceWatchResult {
  watch: PriceWatch;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/** Likely price risers and fallers from live net-transfer momentum. */
export function usePriceWatch(): UsePriceWatchResult {
  const players = usePlayers();
  const bootstrap = useBootstrap();

  const watch = useMemo<PriceWatch>(
    () =>
      players.data
        ? priceWatch(players.data, bootstrap.data?.totalPlayers ?? 0)
        : { risers: [], fallers: [] },
    [players.data, bootstrap.data?.totalPlayers],
  );

  return {
    watch,
    isLoading: players.isLoading || bootstrap.isLoading,
    isError: players.isError,
    error: players.error,
    refetch: () => void players.refetch(),
  };
}
