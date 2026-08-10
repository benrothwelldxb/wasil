/**
 * Central, documented thresholds for the baseline and insight engines.
 *
 * These are deliberately conservative. elowa would rather say "not enough data
 * yet" than present statistical noise as a meaningful pattern. Everything here
 * is a plain constant so the behaviour is transparent and testable — there is
 * no model, no learning, no AI.
 *
 * Values are expressed in **severity units** (0 = None … 4 = Severe), which is
 * the numeric scale the analysis layer resolves every observation onto.
 */

export const BASELINE = {
  /** Below this many logged days for a symptom, we show "insufficient data". */
  MIN_DAYS: 5,
  /** Reaching this many logged days moves a symptom to an "established" baseline. */
  LEARNING_TARGET_DAYS: 14,
  /** Most-recent N values used for rolling baseline statistics once established. */
  ROLLING_WINDOW: 21,
  /** Neutral "usual" anchor (Mild) that relative statuses are measured from. */
  NEUTRAL_REF: 1,
  /** Recent window compared against the baseline to detect recalibration. */
  RECAL_WINDOW: 7,
  /** Sustained recent deviation (severity units) that flags "recalibrating". */
  RECAL_DEVIATION: 1.0,
} as const;

export const INSIGHTS = {
  /** Total logged days required before we attempt symptom insights at all. */
  MIN_LOGGED_DAYS: 8,
  /** The "recent" comparison window (days). */
  RECENT_WINDOW: 7,
  /** The "previous" comparison window (days), immediately before the recent one. */
  PREVIOUS_WINDOW: 7,
  /** Minimum recent-vs-baseline gap (severity units) to report a change. */
  CHANGE_MIN_DELTA: 0.6,
  /** Minimum improvement (severity units) to report a positive change. */
  IMPROVEMENT_MIN_DELTA: 0.6,
  /** Frequency insight: at least this many worse-than-usual days in the recent window. */
  FREQUENCY_MIN_DAYS: 5,
  /** Co-occurrence: minimum number of shared days where both were worse. */
  COOCCURRENCE_MIN_DAYS: 4,
  /** Co-occurrence: fraction of one symptom's worse-days that overlap the other. */
  COOCCURRENCE_MIN_RATE: 0.55,
  /** Sequence: minimum number of "A-then-B next day" occurrences. */
  SEQUENCE_MIN_OCCURRENCES: 3,
  /** Treatment observation: minimum logged days each side of the change. */
  TREATMENT_MIN_DAYS_EACH_SIDE: 5,
  /** Treatment observation: minimum change in worse-day rate to note it. */
  TREATMENT_MIN_RATE_DELTA: 0.2,
  /** An insight is a "recurring pattern" (vs "early signal") at/above this evidence count. */
  RECURRING_MIN_EVIDENCE: 6,
} as const;

export const CHANGEPOINT = {
  /** Minimum logged days for a measure before change detection runs. */
  MIN_DAYS: 10,
  /** Recent window (days) compared against the baseline. */
  WINDOW: 7,
  /** Minimum recent days present to evaluate the window. */
  MIN_WINDOW: 5,
  /** Deviation (severity units) that counts as "slightly outside". */
  SLIGHT_DELTA: 0.5,
  /** Deviation that counts as "noticeably different". */
  NOTICEABLE_DELTA: 0.9,
  /** Deviation required to call a change "sustained". */
  SUSTAINED_DELTA: 0.7,
  /** Share of the recent window that must agree in direction to be "sustained". */
  SUSTAINED_SHARE: 0.5,
} as const;

export const PATTERNS = {
  /** Minimum shared days for a same-day association. */
  SAME_DAY_MIN: 4,
  /** Minimum overlap rate of the rarer measure's notable days. */
  SAME_DAY_MIN_RATE: 0.55,
  /** Minimum occurrences for a lagged (A → next-day B) association. */
  LAGGED_MIN: 3,
  /** Minimum lagged occurrence rate over A's notable days. */
  LAGGED_MIN_RATE: 0.5,
  /** Evidence count at/above which a pattern is "strong". */
  STRONG_MIN_EVIDENCE: 8,
  /** Evidence count at/above which a pattern is "recurring". */
  RECURRING_MIN_EVIDENCE: 5,
  /** Max insights returned to any surface (before per-surface caps). */
  MAX_INSIGHTS: 8,
} as const;

export const CYCLE = {
  /** Days gap that separates one bleed from the next (bridges spotting gaps). */
  MAX_BLEED_GAP: 2,
  /** Minimum recorded cycles before we describe variability. */
  MIN_CYCLES_FOR_STATS: 2,
} as const;
