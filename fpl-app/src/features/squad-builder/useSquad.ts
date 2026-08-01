import { useCallback, useMemo } from "react";
import type { Player } from "@/features/fpl";
import { usePlayers } from "@/features/fpl";
import { useSquadStore } from "./squadStore";
import { checkCanAdd, computeSquadState } from "./rules";
import type { AddCheck, SquadState } from "./types";

export interface UseSquadResult extends SquadState {
  /** Set of selected player ids for O(1) membership checks. */
  selectedIds: Set<number>;
  isSelected: (id: number) => boolean;
  /** Whether a player may be legally added right now. */
  canAddPlayer: (player: Player) => AddCheck;
  /** Add a player (no-op if the add would be illegal). */
  addPlayer: (player: Player) => void;
  removePlayer: (player: Player) => void;
  /** Add if absent, remove if present — the single-click handler. */
  togglePlayer: (player: Player) => void;
  clear: () => void;
}

/**
 * The squad builder's single source of truth.
 *
 * Combines the persisted id list with live player data to produce fully
 * derived, validated squad state, plus rule-enforcing mutators. Illegal adds
 * are rejected here, so the UI can never assemble an invalid team.
 */
export function useSquad(): UseSquadResult {
  const playerIds = useSquadStore((s) => s.playerIds);
  const addId = useSquadStore((s) => s.add);
  const removeId = useSquadStore((s) => s.remove);
  const clear = useSquadStore((s) => s.clear);

  const playersQuery = usePlayers();

  const playersById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of playersQuery.data ?? []) map.set(p.id, p);
    return map;
  }, [playersQuery.data]);

  const selectedIds = useMemo(() => new Set(playerIds), [playerIds]);

  const selectedPlayers = useMemo(() => {
    const players: Player[] = [];
    for (const id of playerIds) {
      const player = playersById.get(id);
      if (player) players.push(player);
    }
    return players;
  }, [playerIds, playersById]);

  const state = useMemo(
    () => computeSquadState(selectedPlayers),
    [selectedPlayers],
  );

  const canAddPlayer = useCallback(
    (player: Player) => checkCanAdd(player, state, selectedIds),
    [state, selectedIds],
  );

  const addPlayer = useCallback(
    (player: Player) => {
      if (checkCanAdd(player, state, selectedIds).canAdd) addId(player.id);
    },
    [state, selectedIds, addId],
  );

  const removePlayer = useCallback(
    (player: Player) => removeId(player.id),
    [removeId],
  );

  const togglePlayer = useCallback(
    (player: Player) => {
      if (selectedIds.has(player.id)) removeId(player.id);
      else if (checkCanAdd(player, state, selectedIds).canAdd) addId(player.id);
    },
    [selectedIds, state, addId, removeId],
  );

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    ...state,
    selectedIds,
    isSelected,
    canAddPlayer,
    addPlayer,
    removePlayer,
    togglePlayer,
    clear,
  };
}
