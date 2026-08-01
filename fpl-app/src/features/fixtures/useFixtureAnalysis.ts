import { useMemo } from "react";
import { useFixtures } from "@/features/fpl";
import type { ApiError } from "@/services/api";
import { buildFixtureAnalysisMap } from "./analysis";
import type { FixtureAnalysisMap } from "./types";

export interface UseFixtureAnalysisResult {
  /** Team-id → fixture analysis. Empty until fixtures load. */
  analysis: FixtureAnalysisMap;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  /** Epoch ms of the last successful fixtures fetch. */
  dataUpdatedAt: number;
  refetch: () => void;
}

/**
 * Per-team fixture analysis derived from the shared fixtures query.
 *
 * Because it reads the same `/fixtures/` query (which refetches in the
 * background) and only counts unfinished fixtures, the analysis refreshes
 * automatically as each gameweek is played — no manual invalidation needed.
 */
export function useFixtureAnalysis(): UseFixtureAnalysisResult {
  const fixtures = useFixtures();

  const analysis = useMemo<FixtureAnalysisMap>(
    () => (fixtures.data ? buildFixtureAnalysisMap(fixtures.data) : new Map()),
    [fixtures.data],
  );

  return {
    analysis,
    isLoading: fixtures.isLoading,
    isError: fixtures.isError,
    error: fixtures.error,
    dataUpdatedAt: fixtures.dataUpdatedAt,
    refetch: fixtures.refetch,
  };
}
