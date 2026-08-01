/**
 * ════════════════════════════════════════════════════════════════════════
 *  EXPECTED POINTS (xPts) PREDICTION ENGINE — CONFIGURATION
 * ════════════════════════════════════════════════════════════════════════
 *
 * The ONLY place to tune the statistical model. Every coefficient, weight,
 * point value, and assumption lives here so the engine code contains no magic
 * numbers. There is NO AI/ML here — this is a transparent statistical model.
 *
 * MODEL OVERVIEW (all formulas documented at their use-site):
 *
 *  1. Team goal expectations use a Poisson strength model:
 *       λ_for     = AVG_GOALS × (teamAttack / leagueAvgAttack)
 *                              × (leagueAvgDefence / oppDefence)
 *       λ_against = AVG_GOALS × (oppAttack  / leagueAvgAttack)
 *                              × (leagueAvgDefence / teamDefence)
 *     Home/away is captured by using each club's home vs away strength.
 *
 *  2. Clean-sheet probability = P(0 conceded) = exp(−λ_against)   [Poisson].
 *
 *  3. Player attacking returns scale their per-90 xG/xA (blended with actual
 *     output) by expected minutes and the fixture "attack environment"
 *     (λ_for / AVG_GOALS).
 *
 *  4. Expected points = Σ of additive, signed point contributions
 *     (appearance, goals, assists, clean sheet, saves, bonus, conceded,
 *     discipline). The sum is exact — nothing is hidden.
 *
 *  5. Confidence blends sample size (minutes), starter security, and a
 *     per-horizon decay.
 */

// ── FPL scoring point values ────────────────────────────────────────────
export const POINTS = {
  /** Appearance: 1 pt for any minutes, +1 more for ≥60 mins. */
  appearanceAny: 1,
  appearance60: 1,
  /** Goal points by position id (1 GK, 2 DEF, 3 MID, 4 FWD). */
  goal: { 1: 6, 2: 6, 3: 5, 4: 4 } as Record<number, number>,
  assist: 3,
  /** Clean-sheet points by position id (needs ≥60 mins). */
  cleanSheet: { 1: 4, 2: 4, 3: 1, 4: 0 } as Record<number, number>,
  /** −1 point per this many goals conceded (GK/DEF). */
  concededPerGoals: 2,
  concededPenalty: -1,
  /** +1 point per this many saves (GK). */
  savesPerPoint: 3,
  yellowCard: -1,
  redCard: -3,
} as const;

// ── League baseline (Poisson) ───────────────────────────────────────────
export const LEAGUE = {
  /** Average goals scored by one team in one match. */
  avgGoalsPerTeam: 1.4,
} as const;

// ── Rate estimation ─────────────────────────────────────────────────────
export const RATES = {
  /** Minimum minutes used as the denominator for per-90 rates (damps noise). */
  minMinutesForRate: 270,
  /** Weight on xG vs actual goals when blending the goal rate (0–1). */
  goalXgWeight: 0.7,
  /** Weight on xA vs actual assists when blending the assist rate. */
  assistXaWeight: 0.7,
} as const;

// ── Set-piece duties ────────────────────────────────────────────────────
export const SET_PIECE = {
  /** Extra xG per 90 added for the first-choice penalty taker. */
  penaltyXgPer90: 0.18,
  /** Extra xA per 90 added for the first-choice corner/free-kick taker. */
  deadballXaPer90: 0.06,
} as const;

// ── Minutes / rotation model ────────────────────────────────────────────
export const MINUTES = {
  /** Avg mins/game at/above which a player is treated as a nailed 60′+ starter. */
  min60High: 75,
  /** Avg mins/game below which the 60′ probability is ~0. */
  min60Low: 30,
  /** Avg mins/game at/above which the "plays at all" probability is ~1. */
  minPlayFull: 25,
  /** Availability multiplier by injury/suspension status when the API gives
   *  no explicit chance-of-playing. */
  availabilityByStatus: {
    available: 1,
    doubtful: 0.5,
    injured: 0,
    suspended: 0,
    unavailable: 0,
    "not-in-squad": 0,
  } as Record<string, number>,
} as const;

// ── Bonus points ────────────────────────────────────────────────────────
export const BONUS = {
  /** Couple bonus to the fixture: bonus ×(min + (max−min)×attackEnvNorm). */
  fixtureCoupling: { min: 0.7, max: 1.3 },
  /** Hard cap on expected bonus per match. */
  cap: 3,
} as const;

// ── Confidence model ────────────────────────────────────────────────────
export const CONFIDENCE = {
  /** Baseline confidence before evidence. */
  base: 0.4,
  /** Weight on sample size (minutes played). */
  sampleWeight: 0.35,
  /** Weight on starter security (p60). */
  starterWeight: 0.25,
  /** Minutes that count as a "full" sample for confidence. */
  fullSampleMinutes: 900,
  /** Per-horizon confidence multiplier — uncertainty compounds over time. */
  horizonDecay: { 1: 1.0, 3: 0.9, 5: 0.8, 8: 0.68 } as Record<number, number>,
  /** Clamp bounds for the reported confidence percentage. */
  floor: 0.05,
  ceil: 0.99,
} as const;

/** Prediction windows, in gameweeks. */
export const WINDOWS = [1, 3, 5, 8] as const;
export type PredictionWindow = (typeof WINDOWS)[number];
