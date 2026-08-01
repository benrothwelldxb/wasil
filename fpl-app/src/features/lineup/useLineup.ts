import { useCallback, useEffect, useMemo, useState } from "react";
import type { Player } from "@/features/fpl";
import {
  usePredictions,
  type PredictionWindow,
} from "@/features/predictions";
import { useActivePreferences } from "@/features/preferences";
import { useSquad } from "@/features/squad-builder";
import { autoPickLineup, isLegalEleven } from "./autopick";
import { projectLineup } from "./projection";
import type { Lineup, LineupProjection, LitePlayer } from "./types";

const GK = 1;

export interface LineupPlayer extends LitePlayer {
  player: Player;
}

export interface UseLineupResult {
  /** Whether a complete, legal 15-man squad is available. */
  squadReady: boolean;
  squadSize: number;
  window: PredictionWindow;
  setWindow: (w: PredictionWindow) => void;

  playersById: Map<number, LineupPlayer>;
  lineup: Lineup;
  projection: LineupProjection;
  /** True when the user has manually edited away from the auto pick. */
  isEdited: boolean;

  /** Swap a starter for a bench player (no-op if it breaks the formation). */
  substitute: (starterId: number, benchId: number) => void;
  setCaptain: (id: number) => void;
  setVice: (id: number) => void;
  moveBench: (id: number, direction: -1 | 1) => void;
  reset: () => void;

  isLoading: boolean;
  isError: boolean;
}

function keyOf(lineup: Lineup): string {
  return JSON.stringify([
    lineup.starterIds,
    lineup.benchGkId,
    lineup.benchOutfieldIds,
    lineup.captainId,
    lineup.viceId,
  ]);
}

export function useLineup(): UseLineupResult {
  const squad = useSquad();
  const { byId, isLoading, isError } = usePredictions();
  const prefs = useActivePreferences();

  const [window, setWindow] = useState<PredictionWindow>(prefs.planningHorizon);

  const playersById = useMemo(() => {
    const map = new Map<number, LineupPlayer>();
    for (const p of squad.players) {
      const value = byId.get(p.id)?.windows[window].expectedPoints ?? 0;
      map.set(p.id, { id: p.id, positionId: p.positionId, value, player: p });
    }
    return map;
  }, [squad.players, byId, window]);

  const litePlayers = useMemo(
    () => [...playersById.values()],
    [playersById],
  );

  const squadReady = squad.isComplete && litePlayers.length === 15;

  const autoLineup = useMemo(
    () => autoPickLineup(litePlayers),
    [litePlayers],
  );

  const [override, setOverride] = useState<Lineup | null>(null);
  const autoKey = keyOf(autoLineup);
  // Reset any manual edits when the squad or horizon changes the auto pick.
  useEffect(() => {
    setOverride(null);
  }, [autoKey]);

  const lineup = override ?? autoLineup;

  const liteById = playersById as Map<number, LitePlayer>;
  const projection = useMemo(
    () => projectLineup(lineup, liteById),
    [lineup, liteById],
  );

  // Re-derive captain/vice when the current holders leave the XI.
  const fixCaptaincy = useCallback(
    (starterIds: number[], captainId: number | null, viceId: number | null) => {
      const set = new Set(starterIds);
      const ranked = starterIds
        .map((id) => playersById.get(id))
        .filter((p): p is LineupPlayer => p !== undefined)
        .sort((a, b) => b.value - a.value);
      const cap =
        captainId !== null && set.has(captainId)
          ? captainId
          : (ranked[0]?.id ?? null);
      const vice =
        viceId !== null && set.has(viceId) && viceId !== cap
          ? viceId
          : (ranked.find((p) => p.id !== cap)?.id ?? null);
      return { cap, vice };
    },
    [playersById],
  );

  const substitute = useCallback(
    (starterId: number, benchId: number) => {
      const outP = playersById.get(starterId);
      const inP = playersById.get(benchId);
      if (!outP || !inP) return;

      const newStarterIds = lineup.starterIds.map((id) =>
        id === starterId ? benchId : id,
      );
      const starters = newStarterIds
        .map((id) => playersById.get(id))
        .filter((p): p is LineupPlayer => p !== undefined);
      if (!isLegalEleven(starters)) return; // would break the formation

      // Rebuild bench: the outgoing starter takes the incoming player's slot.
      let benchGkId = lineup.benchGkId;
      let benchOutfieldIds = lineup.benchOutfieldIds;
      if (inP.positionId === GK) {
        benchGkId = starterId;
      } else {
        benchOutfieldIds = lineup.benchOutfieldIds.map((id) =>
          id === benchId ? starterId : id,
        );
      }

      const { cap, vice } = fixCaptaincy(
        newStarterIds,
        lineup.captainId,
        lineup.viceId,
      );

      setOverride({
        starterIds: newStarterIds,
        benchGkId,
        benchOutfieldIds,
        captainId: cap,
        viceId: vice,
      });
    },
    [lineup, playersById, fixCaptaincy],
  );

  const setCaptain = useCallback(
    (id: number) => {
      if (!lineup.starterIds.includes(id)) return;
      let vice = lineup.viceId === id ? lineup.captainId : lineup.viceId;
      if (vice === null || !lineup.starterIds.includes(vice) || vice === id) {
        vice =
          lineup.starterIds
            .map((sid) => playersById.get(sid))
            .filter((p): p is LineupPlayer => p !== undefined)
            .sort((a, b) => b.value - a.value)
            .find((p) => p.id !== id)?.id ?? null;
      }
      setOverride({ ...lineup, captainId: id, viceId: vice });
    },
    [lineup, playersById],
  );

  const setVice = useCallback(
    (id: number) => {
      if (!lineup.starterIds.includes(id) || id === lineup.captainId) return;
      setOverride({ ...lineup, viceId: id });
    },
    [lineup],
  );

  const moveBench = useCallback(
    (id: number, direction: -1 | 1) => {
      const idx = lineup.benchOutfieldIds.indexOf(id);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= lineup.benchOutfieldIds.length) return;
      const order = lineup.benchOutfieldIds.slice();
      const a = order[idx]!;
      order[idx] = order[next]!;
      order[next] = a;
      setOverride({ ...lineup, benchOutfieldIds: order });
    },
    [lineup],
  );

  const reset = useCallback(() => setOverride(null), []);

  return {
    squadReady,
    squadSize: litePlayers.length,
    window,
    setWindow,
    playersById,
    lineup,
    projection,
    isEdited: override !== null,
    substitute,
    setCaptain,
    setVice,
    moveBench,
    reset,
    isLoading,
    isError,
  };
}
