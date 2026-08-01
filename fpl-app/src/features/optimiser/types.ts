import type { Player } from "@/features/fpl";
import type { PlayerPrediction } from "@/features/predictions";

/** A player as seen by the optimiser: an id, a cost, and a value to maximise. */
export interface OptiPlayer {
  id: number;
  positionId: number;
  teamId: number;
  /** Cost in tenths of a million (exact integer budget arithmetic). */
  cost: number;
  /** Projected points over the chosen horizon — the figure reported to the user. */
  value: number;
  /**
   * The score to *maximise* when selecting. Defaults to `value`; when the user
   * has preferences (club affinity, risk, etc.) this is the preference-adjusted
   * score, so selection honours preferences while reporting stays raw points.
   */
  objective?: number;
  player: Player;
  prediction: PlayerPrediction;
}

/** A starting-XI formation (outfield split; always 1 GK). */
export interface Formation {
  def: number;
  mid: number;
  fwd: number;
}

/** FPL squad rules the optimiser must respect. */
export interface OptiRules {
  /** Budget in tenths of a million. */
  budget: number;
  maxPerClub: number;
  /** Required count per position id. */
  positionTargets: Record<number, number>;
}

/** The best XI extracted from a 15-man squad. */
export interface BestEleven {
  formation: Formation;
  starters: OptiPlayer[];
  bench: OptiPlayer[];
  /** Projected points of the starting XI (raw, for reporting). */
  startingValue: number;
  benchValue: number;
  /** Selection score of the XI (preference-adjusted, for optimisation). */
  startingObjective: number;
  benchObjective: number;
}

/** A per-player explanation of the selection. */
export interface SelectionReason {
  playerId: number;
  role: "starter" | "bench";
  reason: string;
}

/** The optimiser's result. */
export interface OptimisedSquad {
  squad: OptiPlayer[];
  best: BestEleven;
  reasons: Map<number, SelectionReason>;
  /** Total projected points of the starting XI. */
  totalProjected: number;
  /** Total squad cost, in tenths. */
  cost: number;
  /** Remaining budget, in tenths. */
  remaining: number;
  /** Whether the squad satisfies every FPL constraint. */
  valid: boolean;
  /** Objective value reached (starting value + tiny bench tie-breaker). */
  objective: number;
  /** How long the optimisation took, in ms. */
  elapsedMs: number;
}
