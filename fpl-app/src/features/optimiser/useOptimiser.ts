import { useMemo, useState } from "react";
import { usePredictions, type PredictionWindow } from "@/features/predictions";
import { useActivePreferences } from "@/features/preferences";
import type { ApiError } from "@/services/api";
import { DEFAULT_RULES } from "./config";
import { optimiseSquad } from "./engine";
import type { Formation, OptiPlayer, OptimisedSquad } from "./types";

/** Budget held back (tenths) by budget philosophy. */
const RESERVE_BY_PHILOSOPHY: Record<string, number> = {
  "spend-every-penny": 0,
  balanced: 5,
  "leave-cash": 20,
};

export interface UseOptimiserResult {
  result: OptimisedSquad | null;
  window: PredictionWindow;
  setWindow: (w: PredictionWindow) => void;
  formation: Formation | null;
  setFormation: (f: Formation | null) => void;
  /** Effective budget used (tenths), after any reserve. */
  budget: number;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Runs the optimiser over the prediction engine's projected points.
 *
 * The horizon defaults to the active preference profile's planning horizon, so
 * the optimiser automatically targets the window the user cares about. Budget
 * philosophy trims the spend cap. The optimisation is memoized on its inputs.
 */
export function useOptimiser(): UseOptimiserResult {
  const { predictions, isLoading, isError, error, refetch } = usePredictions();
  const prefs = useActivePreferences();

  const [window, setWindow] = useState<PredictionWindow>(prefs.planningHorizon);
  const [formation, setFormation] = useState<Formation | null>(null);

  const budget =
    DEFAULT_RULES.budget - (RESERVE_BY_PHILOSOPHY[prefs.budgetPhilosophy] ?? 0);

  const result = useMemo<OptimisedSquad | null>(() => {
    if (predictions.length === 0) return null;

    const optiPlayers: OptiPlayer[] = predictions
      .map((pred) => ({
        id: pred.playerId,
        positionId: pred.player.positionId,
        teamId: pred.player.teamId,
        cost: pred.player.price.nowRaw,
        value: pred.windows[window].expectedPoints,
        player: pred.player,
        prediction: pred,
      }))
      .filter((p) => p.cost > 0);

    return optimiseSquad(optiPlayers, {
      rules: { ...DEFAULT_RULES, budget },
      formation: formation ?? undefined,
      window,
    });
  }, [predictions, window, formation, budget]);

  return {
    result,
    window,
    setWindow,
    formation,
    setFormation,
    budget,
    isLoading,
    isError,
    error,
    refetch,
  };
}
