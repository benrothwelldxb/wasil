/**
 * ════════════════════════════════════════════════════════════════════════
 *  PLAYER SCORING ENGINE — TUNING CONFIG
 * ════════════════════════════════════════════════════════════════════════
 *
 * This is the ONE file to edit when tuning the scoring engine. Every weight,
 * scale, and point value lives here — the engine itself contains no magic
 * numbers. Nothing here uses AI; it's a transparent, deterministic model.
 *
 * - `SCORING_WEIGHTS` — how much each metric matters, per position.
 * - `METRIC_SCALES`   — how raw stats are normalised to a 0–1 scale.
 * - `XP_MODEL`        — the Expected Points (xP) point values & multipliers.
 * - `CLEAN_SHEET`     — the clean-sheet probability model.
 */

export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

export type MetricKey =
  | "fixture"
  | "form"
  | "minutes"
  | "goalInvolvement"
  | "cleanSheet"
  | "priceEfficiency"
  | "ownership";

/** Human labels for each metric (used across the breakdown UI). */
export const METRIC_LABELS: Record<MetricKey, string> = {
  fixture: "Fixture difficulty",
  form: "Recent form",
  minutes: "Minutes played",
  goalInvolvement: "Goal involvement",
  cleanSheet: "Clean sheet probability",
  priceEfficiency: "Price efficiency",
  ownership: "Ownership",
};

export const METRIC_ORDER: MetricKey[] = [
  "fixture",
  "form",
  "minutes",
  "goalInvolvement",
  "cleanSheet",
  "priceEfficiency",
  "ownership",
];

export type ScoringWeights = Record<MetricKey, number>;

/**
 * Per-position metric weights. They need NOT sum to 1 — the engine normalises
 * them — so you can tune a single number without rebalancing the rest.
 *
 * Rationale: keepers/defenders lean on clean sheets & minutes; forwards on
 * goal involvement; midfielders sit in between.
 */
export const SCORING_WEIGHTS: Record<PositionGroup, ScoringWeights> = {
  GK: {
    fixture: 0.2,
    form: 0.1,
    minutes: 0.25,
    goalInvolvement: 0.0,
    cleanSheet: 0.3,
    priceEfficiency: 0.1,
    ownership: 0.05,
  },
  DEF: {
    fixture: 0.2,
    form: 0.12,
    minutes: 0.18,
    goalInvolvement: 0.12,
    cleanSheet: 0.25,
    priceEfficiency: 0.08,
    ownership: 0.05,
  },
  MID: {
    fixture: 0.18,
    form: 0.18,
    minutes: 0.15,
    goalInvolvement: 0.28,
    cleanSheet: 0.06,
    priceEfficiency: 0.1,
    ownership: 0.05,
  },
  FWD: {
    fixture: 0.18,
    form: 0.18,
    minutes: 0.14,
    goalInvolvement: 0.35,
    cleanSheet: 0.0,
    priceEfficiency: 0.1,
    ownership: 0.05,
  },
};

/**
 * Normalisation scales: the raw value that maps to a perfect 1.0 for each
 * metric. Lower a scale to make a metric "max out" sooner.
 */
export const METRIC_SCALES = {
  /** Recent form (points/game) that maps to 1.0. */
  form: 8,
  /** Minutes that count as fully "nailed". */
  minutes: 1800,
  /** Season goals + assists that map to 1.0. */
  goalsAssists: 15,
  /** Expected goal involvements per 90 that map to 1.0. */
  xgiPer90: 1.0,
  /** Points-per-million that maps to 1.0. */
  pointsPerMillion: 22,
  /** Ownership % that maps to 1.0. */
  ownershipPct: 50,
  /** Minimum minutes used when computing per-90 rates (dampens tiny samples). */
  minMinutesForRate: 270,
} as const;

/**
 * Expected Points (xP) model — plain FPL scoring, no AI.
 * Point values keyed by position id (1 GK, 2 DEF, 3 MID, 4 FWD).
 */
export const XP_MODEL = {
  /** Appearance points for a player expected to start (≥60 mins). */
  appearancePoints: 2,
  /** Goal points by position id. */
  goalPoints: { 1: 6, 2: 6, 3: 5, 4: 4 } as Record<number, number>,
  /** Assist points (same for all positions). */
  assistPoints: 3,
  /** Clean-sheet points by position id. */
  cleanSheetPoints: { 1: 4, 2: 4, 3: 1, 4: 0 } as Record<number, number>,
  /** Bonus-point uplift as a fraction of attacking points. */
  bonusFactor: 0.15,
  /** Attacking-returns multiplier as fixtures ease (0 = hardest, 1 = easiest). */
  attackMultiplier: { min: 0.8, max: 1.2 },
} as const;

/**
 * Clean-sheet probability model: `p = base + slope × fixtureEase`, capped.
 * `positionFactor` scales the probability's scoring impact by position id.
 */
export const CLEAN_SHEET = {
  base: 0.05,
  slope: 0.55,
  max: 0.75,
  positionFactor: { 1: 1, 2: 1, 3: 0.6, 4: 0 } as Record<number, number>,
} as const;

/** Map an FPL position id to its scoring group. */
export function positionGroup(positionId: number): PositionGroup {
  switch (positionId) {
    case 1:
      return "GK";
    case 2:
      return "DEF";
    case 3:
      return "MID";
    default:
      return positionId === 4 ? "FWD" : "MID";
  }
}
