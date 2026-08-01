import { useMemo } from "react";
import { useBootstrap, usePlayers, useTeams } from "@/features/fpl";
import { useFixtureAnalysis } from "@/features/fixtures";
import type { ApiError } from "@/services/api";
import { buildPredictionContext } from "./context";
import { predictionEngine } from "./engine";
import type { PlayerPrediction } from "./types";

export interface UsePredictionsResult {
  /** Prediction for every player. */
  predictions: PlayerPrediction[];
  /** Predictions keyed by player id — for consumers that look players up. */
  byId: Map<number, PlayerPrediction>;
  /** The engine identifier in use (e.g. "statistical-v1"). */
  engineId: string;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * The prediction engine as a hook — the app-level entry point for xPts.
 *
 * Squad Optimiser, Captain Selector, Transfer Planner, and the AI Manager
 * should consume THIS (or `predictionEngine` directly with a context). Because
 * they depend on the `PredictionEngine` interface, swapping in an ML engine
 * later requires no changes here or in those consumers.
 */
export function usePredictions(): UsePredictionsResult {
  const playersQuery = usePlayers();
  const teamsQuery = useTeams();
  const bootstrap = useBootstrap();
  const { analysis } = useFixtureAnalysis();

  const predictions = useMemo<PlayerPrediction[]>(() => {
    if (!playersQuery.data || !teamsQuery.data) return [];
    const ctx = buildPredictionContext(
      teamsQuery.data,
      analysis,
      bootstrap.data?.currentEventId ?? null,
    );
    return predictionEngine.predictAll(playersQuery.data, ctx);
  }, [playersQuery.data, teamsQuery.data, analysis, bootstrap.data?.currentEventId]);

  const byId = useMemo(
    () => new Map(predictions.map((p) => [p.playerId, p])),
    [predictions],
  );

  return {
    predictions,
    byId,
    engineId: predictionEngine.id,
    isLoading: playersQuery.isLoading,
    isError: playersQuery.isError,
    error: playersQuery.error,
    refetch: () => void playersQuery.refetch(),
  };
}
