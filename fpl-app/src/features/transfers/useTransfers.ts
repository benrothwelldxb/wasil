import { useMemo, useState } from "react";
import { usePredictions, type PredictionWindow } from "@/features/predictions";
import { useActivePreferences } from "@/features/preferences";
import { useSquad } from "@/features/squad-builder";
import { bestDouble, bestSingle, bestWildcard, lineupTotal } from "./engine";
import { useTransferSettings } from "./store";
import type { TransferPlans, TransferPlayer } from "./types";

export interface UseTransfersResult {
  squadReady: boolean;
  squadSize: number;
  window: PredictionWindow;
  setWindow: (w: PredictionWindow) => void;
  freeTransfers: number;
  setFreeTransfers: (n: number) => void;
  bank: number;
  plans: TransferPlans | null;
  isLoading: boolean;
  isError: boolean;
}

/** Statuses that keep a player out of transfer suggestions. */
const UNAVAILABLE = new Set([
  "injured",
  "suspended",
  "unavailable",
  "not-in-squad",
]);

export function useTransfers(): UseTransfersResult {
  const squad = useSquad();
  const { predictions, byId, isLoading, isError } = usePredictions();
  const prefs = useActivePreferences();
  const freeTransfers = useTransferSettings((s) => s.freeTransfers);
  const setFreeTransfers = useTransferSettings((s) => s.setFreeTransfers);

  const [window, setWindow] = useState<PredictionWindow>(prefs.planningHorizon);

  const bank = squad.remainingTenths;
  const squadReady = squad.isComplete && squad.players.length === 15;

  const plans = useMemo<TransferPlans | null>(() => {
    if (!squadReady || predictions.length === 0) return null;

    // Current squad as transfer players (projected value for the window).
    const current: TransferPlayer[] = [];
    for (const pl of squad.players) {
      const pred = byId.get(pl.id);
      if (!pred) return null;
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

    // The market: every player with a price, excluding avoided clubs (a hard
    // constraint) and players flagged out (injured/suspended/unavailable).
    const avoid = new Set(prefs.avoidClubIds);
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
      .filter(
        (p) =>
          p.cost > 0 &&
          !avoid.has(p.teamId) &&
          !UNAVAILABLE.has(p.player.availability),
      );

    return {
      currentProjected: lineupTotal(current),
      bank,
      freeTransfers,
      window,
      single: bestSingle(current, market, bank, freeTransfers, window),
      double: bestDouble(current, market, bank, freeTransfers, window),
      wildcard: bestWildcard(current, market, bank, window),
    };
  }, [
    squadReady,
    predictions,
    byId,
    squad.players,
    window,
    bank,
    freeTransfers,
    prefs.avoidClubIds,
  ]);

  return {
    squadReady,
    squadSize: squad.players.length,
    window,
    setWindow,
    freeTransfers,
    setFreeTransfers,
    bank,
    plans,
    isLoading,
    isError,
  };
}
