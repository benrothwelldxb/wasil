/**
 * elowa baseline engine.
 *
 * Turns raw check-ins into per-symptom numeric series, then learns each
 * symptom's *usual range*. It is fully deterministic — no AI, no model, no
 * randomness. See `docs/BASELINE.md` for the methodology.
 *
 * Measurement model
 * -----------------
 * Every observation is resolved onto a 0–4 scale anchored at "usual":
 *   - An explicit severity (None…Severe) maps directly to 0…4.
 *   - A relative status resolves to a NEUTRAL "usual" anchor (Mild = 1) plus the
 *     status delta: better = 0, about usual = 1, a little worse = 2,
 *     much worse = 3 (clamped to 0–4).
 * A plain "normal" day resolves every pinned symptom as "about usual" (= 1).
 * The baseline then learns each symptom's typical range and variability from
 * this series, so a stretch of worse-than-usual days reads as above the range,
 * and a return to normal reads as back within it.
 */

import type { DailyCheckIn, RelativeStatus, Severity } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { RELATIVE_STATUS_SCALE, SEVERITY_SCALE } from '@/domain/constants';
import { BASELINE } from './thresholds';
import { clamp, lastN, mean, round1, stdDev } from './stats';

export type BaselineState = 'insufficient' | 'learning' | 'established' | 'recalibrating';

export interface DayValue {
  date: IsoDate;
  value: number;
  /** Above the user's usual range for this symptom. */
  worse: boolean;
}

export interface SymptomBaseline {
  symptomId: string;
  state: BaselineState;
  /** Number of logged days contributing to this symptom. */
  n: number;
  mean: number;
  sd: number;
  /** Usual-range band. */
  low: number;
  high: number;
  recentMean: number;
  recentN: number;
}

export interface SymptomAnalysis {
  symptomId: string;
  baseline: SymptomBaseline;
  values: DayValue[];
  byDate: Map<IsoDate, DayValue>;
}

export interface OverallBaseline {
  state: BaselineState;
  checkInCount: number;
  distinctDays: number;
  /** Days remaining until the baseline is considered established. */
  daysToEstablished: number;
}

function numFromSeverity(severity: Severity): number {
  return SEVERITY_SCALE.find((s) => s.value === severity)?.ordinal ?? 0;
}

function statusDelta(status: RelativeStatus): number {
  return RELATIVE_STATUS_SCALE.find((s) => s.value === status)?.delta ?? 0;
}

/** Chronological, de-duplicated check-ins (latest wins for a given date). */
export function normaliseCheckIns(checkIns: readonly DailyCheckIn[]): DailyCheckIn[] {
  const byDate = new Map<IsoDate, DailyCheckIn>();
  for (const ci of checkIns) byDate.set(ci.date, ci);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function distinctLoggedDays(checkIns: readonly DailyCheckIn[]): number {
  return new Set(checkIns.map((c) => c.date)).size;
}

/**
 * Resolve the numeric daily series for one symptom (chronological).
 * `pinnedIds` decides whether unobserved days on a detailed check-in still
 * count as an "about usual" sample.
 */
export function resolveSymptomValues(
  checkIns: readonly DailyCheckIn[],
  symptomId: string,
  pinnedIds: ReadonlySet<string>,
): { date: IsoDate; value: number }[] {
  const ordered = normaliseCheckIns(checkIns);
  const out: { date: IsoDate; value: number }[] = [];

  for (const ci of ordered) {
    const obs = ci.observations.find((o) => o.symptomId === symptomId);
    let status: RelativeStatus | undefined;
    let severity: Severity | undefined;

    if (ci.kind === 'normal') {
      status = 'about_usual';
    } else if (obs) {
      status = obs.status;
      severity = obs.severity;
    } else if (pinnedIds.has(symptomId)) {
      status = 'about_usual';
    } else {
      // Non-pinned symptoms only accrue samples on days they were explicitly
      // observed. (Deliberate: normal days sample every pinned symptom as
      // "about usual", but never invent data for symptoms the user isn't
      // actively tracking.)
      continue;
    }

    // Explicit severity wins; otherwise anchor a relative status at "usual".
    const value =
      severity !== undefined
        ? numFromSeverity(severity)
        : clamp(BASELINE.NEUTRAL_REF + statusDelta(status ?? 'about_usual'), 0, 4);

    out.push({ date: ci.date, value });
  }

  return out;
}

export function computeBaseline(
  symptomId: string,
  series: readonly { date: IsoDate; value: number }[],
  /** Value range to clamp the band to. Symptoms use 0–4; passive metrics pass
   *  their own range (e.g. [0, Infinity]) so hours/steps aren't squashed. */
  range: readonly [number, number] = [0, 4],
): SymptomBaseline {
  const nums = series.map((s) => s.value);
  const n = nums.length;

  const window = lastN(nums, BASELINE.ROLLING_WINDOW);
  const m = mean(window);
  const sd = stdDev(window);
  const low = clamp(m - sd, range[0], range[1]);
  const high = clamp(m + sd, range[0], range[1]);

  const recent = lastN(nums, BASELINE.RECAL_WINDOW);
  const recentMean = mean(recent);

  let state: BaselineState;
  if (n < BASELINE.MIN_DAYS) state = 'insufficient';
  else if (n < BASELINE.LEARNING_TARGET_DAYS) state = 'learning';
  else state = 'established';

  if (
    state === 'established' &&
    recent.length >= BASELINE.RECAL_WINDOW &&
    recentMean - m >= BASELINE.RECAL_DEVIATION
  ) {
    state = 'recalibrating';
  }

  return {
    symptomId,
    state,
    n,
    mean: round1(m),
    sd: round1(sd),
    low: round1(low),
    high: round1(high),
    recentMean: round1(recentMean),
    recentN: recent.length,
  };
}

/** Full analysis for a set of symptoms: baseline + per-day values with worse flags. */
export function analyzeSymptoms(
  checkIns: readonly DailyCheckIn[],
  symptomIds: readonly string[],
  pinnedIds: ReadonlySet<string>,
): Map<string, SymptomAnalysis> {
  const result = new Map<string, SymptomAnalysis>();

  for (const symptomId of symptomIds) {
    const series = resolveSymptomValues(checkIns, symptomId, pinnedIds);
    const baseline = computeBaseline(symptomId, series);
    // A day is "worse" when it reaches/passes the usual-range upper band (and is
    // at least mildly present), so a 0-value day is never flagged worse. We use
    // an inclusive `>=` (no epsilon) so a value sitting exactly at the band edge
    // still counts — otherwise a 50/50 split can hide every worse day.
    const threshold = Math.max(baseline.high, baseline.mean + 0.5);
    const values: DayValue[] = series.map((s) => ({
      date: s.date,
      value: s.value,
      worse: s.value >= threshold && s.value >= 1,
    }));
    const byDate = new Map(values.map((v) => [v.date, v]));
    result.set(symptomId, { symptomId, baseline, values, byDate });
  }

  return result;
}

export function computeOverallBaseline(checkIns: readonly DailyCheckIn[]): OverallBaseline {
  const distinct = distinctLoggedDays(checkIns);
  let state: BaselineState;
  if (distinct === 0 || distinct < BASELINE.MIN_DAYS) state = distinct === 0 ? 'insufficient' : 'learning';
  else if (distinct < BASELINE.LEARNING_TARGET_DAYS) state = 'learning';
  else state = 'established';

  return {
    state,
    checkInCount: checkIns.length,
    distinctDays: distinct,
    daysToEstablished: Math.max(0, BASELINE.LEARNING_TARGET_DAYS - distinct),
  };
}

/** Signed recent deviation from baseline mean (severity units). */
export function symptomDeviation(baseline: SymptomBaseline): number {
  return round1(baseline.recentMean - baseline.mean);
}
