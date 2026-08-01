import type { Player } from "@/features/fpl";
import type { ScoreAdjustment } from "@/features/preferences";
import type { MetricKey } from "./config";

/** One metric's contribution to a player's rating. */
export interface ScoreComponent {
  key: MetricKey;
  label: string;
  /** Normalised weight actually used (weights are normalised to sum to 1). */
  weight: number;
  /** Normalised metric value, 0–1. */
  value: number;
  /** Value on a 0–100 scale, for display. */
  score: number;
  /** Points this metric contributes to the base rating (`weight × score`). */
  contribution: number;
}

/** A fully-scored player. */
export interface PlayerScore {
  player: Player;
  /** Per-metric breakdown (in display order). */
  components: ScoreComponent[];
  /** Objective, preference-agnostic weighted rating (0–100). */
  baseRating: number;
  /** Personalised rating after the PreferenceService adjustments (0–100). */
  overallRating: number;
  /** Projected FPL points for the next gameweek. */
  expectedPoints: number;
  /** Preference adjustments that shifted base → overall (transparency). */
  adjustments: ScoreAdjustment[];
  /** Net % change from base to overall. */
  totalDeltaPercent: number;
  /** 1-based rank by overall rating (assigned by the engine). */
  rank: number;
}
