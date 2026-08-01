import type { Formation } from "@/features/optimiser";

/** A player reduced to what the lineup logic needs. */
export interface LitePlayer {
  id: number;
  positionId: number;
  value: number;
}

/**
 * A chosen lineup: the starting XI, ordered bench, captain and vice. Stored as
 * ids so it survives squad/horizon changes and manual edits cheaply.
 */
export interface Lineup {
  starterIds: number[];
  benchGkId: number | null;
  /** Outfield substitutes in priority order (first = comes on first). */
  benchOutfieldIds: number[];
  captainId: number | null;
  viceId: number | null;
}

/** Projected-score breakdown for a lineup. */
export interface LineupProjection {
  /** Sum of the starting XI's projected points. */
  base: number;
  /** Extra points from the captain (their points count twice). */
  captainBonus: number;
  /** base + captainBonus. */
  total: number;
  formation: Formation;
}
