/**
 * Unified "measure" abstraction (Phase 2).
 *
 * A measure is any per-day numeric signal elowa can reason about: a manually
 * tracked symptom, or a passive metric (sleep, activity) from a health
 * provider. Presenting them through one shape lets the pattern engine treat
 * same-day / lagged associations uniformly, whether the input is subjective or
 * passive.
 *
 * `high` / `low` mark days above / below the user's usual range for that
 * measure. For a symptom, `high` = worse than usual. For sleep, `low` = shorter
 * than usual. For activity, `high` = more active than usual.
 */

import type { HealthDaySample } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { computeBaseline, type SymptomAnalysis, type SymptomBaseline } from './baseline';

export type MeasureKind = 'symptom' | 'sleep' | 'activity';

export interface MeasureDay {
  date: IsoDate;
  value: number;
  high: boolean;
  low: boolean;
}

export interface MeasureAnalysis {
  key: string;
  label: string;
  kind: MeasureKind;
  baseline: SymptomBaseline;
  days: MeasureDay[];
  byDate: Map<IsoDate, MeasureDay>;
}

/** Flag days above/below the usual range (with a small floor to avoid noise). */
function flagDays(series: readonly { date: IsoDate; value: number }[], baseline: SymptomBaseline): MeasureDay[] {
  const highThreshold = Math.max(baseline.high, baseline.mean + 0.5);
  const lowThreshold = Math.min(baseline.low, baseline.mean - 0.5);
  return series.map((s) => ({
    date: s.date,
    value: s.value,
    high: s.value >= highThreshold && s.value > baseline.mean,
    low: s.value <= lowThreshold && s.value < baseline.mean,
  }));
}

export function buildNumericMeasure(
  key: string,
  label: string,
  kind: MeasureKind,
  series: readonly { date: IsoDate; value: number }[],
): MeasureAnalysis {
  // Passive metrics (sleep hours, steps) live outside the 0–4 severity scale,
  // so the baseline band must not be clamped to 0–4.
  const range: readonly [number, number] = kind === 'symptom' ? [0, 4] : [0, Number.POSITIVE_INFINITY];
  const baseline = computeBaseline(key, series, range);
  const days = flagDays(series, baseline);
  return { key, label, kind, baseline, days, byDate: new Map(days.map((d) => [d.date, d])) };
}

/** Adapt an existing symptom analysis into a measure (worse → high). */
export function symptomToMeasure(analysis: SymptomAnalysis, label: string): MeasureAnalysis {
  const days: MeasureDay[] = analysis.values.map((v) => ({
    date: v.date,
    value: v.value,
    high: v.worse,
    low: v.value < analysis.baseline.low && v.value < analysis.baseline.mean,
  }));
  return {
    key: analysis.symptomId,
    label,
    kind: 'symptom',
    baseline: analysis.baseline,
    days,
    byDate: new Map(days.map((d) => [d.date, d])),
  };
}

/** Sleep measure from passive samples (value = hours). Returns null if too sparse. */
export function sleepMeasure(samples: readonly HealthDaySample[]): MeasureAnalysis | null {
  const series = samples
    .filter((s) => typeof s.sleepMinutes === 'number')
    .map((s) => ({ date: s.date, value: (s.sleepMinutes as number) / 60 }));
  if (series.length < 5) return null;
  return buildNumericMeasure('metric_sleep', 'Sleep', 'sleep', series);
}

/** Activity measure from passive samples (value = steps in thousands). */
export function activityMeasure(samples: readonly HealthDaySample[]): MeasureAnalysis | null {
  const series = samples
    .filter((s) => typeof s.steps === 'number')
    .map((s) => ({ date: s.date, value: (s.steps as number) / 1000 }));
  if (series.length < 5) return null;
  return buildNumericMeasure('metric_activity', 'Activity', 'activity', series);
}
