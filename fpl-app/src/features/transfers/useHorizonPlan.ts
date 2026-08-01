import { useMemo } from "react";
import {
  usePredictions,
  WINDOWS,
  type PredictionWindow,
} from "@/features/predictions";
import { useActivePreferences } from "@/features/preferences";
import { useSquad } from "@/features/squad-builder";
import { bestSingle } from "./engine";
import { useTransferSettings } from "./store";
import type { TransferMove, TransferPlayer } from "./types";

export interface HorizonEntry {
  window: PredictionWindow;
  move: TransferMove | null;
}

export interface UseHorizonPlanResult {
  squadReady: boolean;
  entries: HorizonEntry[];
  isLoading: boolean;
}

/**
 * The best single transfer evaluated over each horizon (1 / 3 / 5 / 8 GWs), so
 * a move that only wins this week is easy to tell apart from a long-term hold.
 * Reuses the transfer engine; respects the avoid-club hard filter.
 */
export function useHorizonPlan(): UseHorizonPlanResult {
  const squad = useSquad();
  const { predictions, byId, isLoading } = usePredictions();
  const prefs = useActivePreferences();
  const freeTransfers = useTransferSettings((s) => s.freeTransfers);

  const squadReady = squad.isComplete && squad.players.length === 15;
  const bank = squad.remainingTenths;

  const entries = useMemo<HorizonEntry[]>(() => {
    if (!squadReady || predictions.length === 0) return [];
    const avoid = new Set(prefs.avoidClubIds);

    return WINDOWS.map((window) => {
      const current: TransferPlayer[] = [];
      let ok = true;
      for (const pl of squad.players) {
        const pred = byId.get(pl.id);
        if (!pred) {
          ok = false;
          break;
        }
        current.push({
          id: pl.id,
          positionId: pl.positionId,
          teamId: pl.teamId,
          cost: pl.price.nowRaw,
          value: pred.windows[window].expectedPoints,
          player: pl,
          prediction: pred,
        });
      }
      if (!ok) return { window, move: null };

      const market: TransferPlayer[] = predictions
        .map((pred) => ({
          id: pred.playerId,
          positionId: pred.player.positionId,
          teamId: pred.player.teamId,
          cost: pred.player.price.nowRaw,
          value: pred.windows[window].expectedPoints,
          player: pred.player,
          prediction: pred,
        }))
        .filter((p) => p.cost > 0 && !avoid.has(p.teamId));

      return {
        window,
        move: bestSingle(current, market, bank, freeTransfers, window),
      };
    });
  }, [
    squadReady,
    predictions,
    byId,
    squad.players,
    bank,
    freeTransfers,
    prefs.avoidClubIds,
  ]);

  return { squadReady, entries, isLoading };
}
