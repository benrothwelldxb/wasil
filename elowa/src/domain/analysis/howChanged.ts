/**
 * "How have I changed?" (Phase 3, deterministic).
 *
 * Compares the first vs second half of a range and buckets each measure into
 * improved / changed / stable / new, with cautious language. Treatment context
 * is listed but never causally linked. AI (if enabled) may reword the output.
 */

import type {
  ChangeBucket,
  ChangeLine,
  ChangeSummary,
  DailyCheckIn,
  HealthDaySample,
  TreatmentEvent,
} from '@/domain/models';
import { addDays, daysBetween, formatDayMonth, type IsoDate } from '@/lib/date';
import { analyzeSymptoms, normaliseCheckIns } from './baseline';
import { symptomToMeasure, sleepMeasure, type MeasureAnalysis } from './measures';

export interface HowChangedInputs {
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  healthSamples?: readonly HealthDaySample[];
  rangeStart: IsoDate;
  rangeEnd: IsoDate;
  excludeKeys?: ReadonlySet<string>;
}

function notableRate(days: { value: number }[], kind: MeasureAnalysis['kind']): number {
  if (days.length === 0) return 0;
  const notable = kind === 'sleep' ? (v: number) => v <= 6 : (v: number) => v >= 2;
  return days.filter((d) => notable(d.value)).length / days.length;
}

export function buildChangeSummary(inputs: HowChangedInputs): ChangeSummary {
  const checkIns = normaliseCheckIns(inputs.checkIns).filter(
    (c) => c.date >= inputs.rangeStart && c.date <= inputs.rangeEnd,
  );
  const excluded = inputs.excludeKeys ?? new Set<string>();
  const mid = addDays(inputs.rangeStart, Math.floor(daysBetween(inputs.rangeStart, inputs.rangeEnd) / 2));

  const analysis = analyzeSymptoms(checkIns, inputs.symptomIds, new Set(inputs.pinnedIds));
  const measures: MeasureAnalysis[] = [...analysis.values()].map((a) => symptomToMeasure(a, inputs.labelOf(a.symptomId)));
  if (inputs.healthSamples) {
    const s = sleepMeasure(inputs.healthSamples.filter((h) => h.date >= inputs.rangeStart && h.date <= inputs.rangeEnd));
    if (s) measures.push(s);
  }

  const lines: ChangeLine[] = [];
  for (const m of measures) {
    if (excluded.has(m.key)) continue;
    const first = m.days.filter((d) => d.date < mid);
    const second = m.days.filter((d) => d.date >= mid);
    if (first.length < 3 || second.length < 3) continue;
    const f = notableRate(first, m.kind);
    const s = notableRate(second, m.kind);
    const delta = s - f;
    const label = m.label;
    const worse = m.kind === 'sleep' ? 'shorter sleep' : `worse ${label.toLowerCase()}`;

    let bucket: ChangeBucket;
    let text: string;
    if (f < 0.1 && s >= 0.3) {
      bucket = 'new';
      text = `${label} has appeared more often in the later part of this period.`;
    } else if (delta <= -0.2) {
      bucket = 'improved';
      text = `${worse[0]!.toUpperCase()}${worse.slice(1)} was recorded less often later on.`;
    } else if (delta >= 0.2) {
      bucket = 'changed';
      text = `${worse[0]!.toUpperCase()}${worse.slice(1)} was recorded more often later on.`;
    } else {
      bucket = 'stable';
      text = `${label} stayed close to your usual range.`;
    }
    lines.push({ bucket, label, text });
  }

  const treatmentContext = inputs.treatments
    .filter((t) => t.date >= inputs.rangeStart && t.date <= inputs.rangeEnd)
    .map((t) => `${t.title} on ${formatDayMonth(t.date)}.`);

  const order: ChangeBucket[] = ['improved', 'changed', 'new', 'stable'];
  lines.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));

  return {
    rangeStart: inputs.rangeStart,
    rangeEnd: inputs.rangeEnd,
    lines,
    treatmentContext,
    caveat:
      'This describes what you recorded over the period. Changes may have many reasons and elowa cannot determine why — worth discussing with a healthcare professional.',
  };
}
