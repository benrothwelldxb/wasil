import type { Player } from "@/features/fpl";

/** Severity of a squad validation issue. */
export type SquadIssueLevel = "error" | "todo";

/** A single validation message (illegal state or an outstanding requirement). */
export interface SquadIssue {
  level: SquadIssueLevel;
  message: string;
}

/** Fully-derived state of the current squad. */
export interface SquadState {
  /** Resolved, selected players. */
  players: Player[];
  size: number;

  /** Money spent, in £m and in tenths (exact integer arithmetic). */
  spent: number;
  spentTenths: number;
  /** Money remaining (may be negative if over budget). */
  remaining: number;
  remainingTenths: number;
  /** Total budget in £m (100). */
  budget: number;

  /** Count of selected players per position id. */
  positionCounts: Map<number, number>;
  /** Count of selected players per club (team id). */
  clubCounts: Map<number, number>;

  issues: SquadIssue[];
  /** True when the squad breaks no hard rule (may still be incomplete). */
  isLegal: boolean;
  /** True when the squad is a complete, legal 15-player team. */
  isComplete: boolean;
}

/** Result of checking whether a player may be added. */
export interface AddCheck {
  canAdd: boolean;
  /** Why the add is blocked, when `canAdd` is false. */
  reason?: string;
}
