import { useMemo } from "react";
import { usePlayers } from "@/features/fpl";
import { useFixtureAnalysis } from "@/features/fixtures";
import { usePreferenceService } from "@/features/preferences";
import type { ApiError } from "@/services/api";
import { scoreAllPlayers } from "./engine";
import type { PlayerScore } from "./types";

export interface UseScoringResult {
  /** Every player, scored and ranked by personalised overall rating. */
  scores: PlayerScore[];
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * The scoring engine as a hook. Combines player data, fixture analysis, and
 * the active preference profile's {@link PreferenceService}, and recomputes
 * (memoized) whenever any input changes — including the selected profile, so
 * ratings re-rank when preferences change.
 */
export function useScoring(): UseScoringResult {
  const playersQuery = usePlayers();
  const { analysis } = useFixtureAnalysis();
  const service = usePreferenceService();

  const scores = useMemo<PlayerScore[]>(() => {
    if (!playersQuery.data) return [];
    return scoreAllPlayers(playersQuery.data, { fixtures: analysis, service });
  }, [playersQuery.data, analysis, service]);

  return {
    scores,
    isLoading: playersQuery.isLoading,
    isError: playersQuery.isError,
    error: playersQuery.error,
    refetch: () => void playersQuery.refetch(),
  };
}
