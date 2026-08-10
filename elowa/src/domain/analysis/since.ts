/**
 * "What's changed since…?" — deterministic before/after comparison (Phase 2).
 *
 * Compares each measure's rate of worse-than-usual (or shorter-than-usual for
 * sleep) days before and after an anchor date, and classifies each as less /
 * more / similar. It always states that changes merely occurred during the same
 * period — never that the anchor caused them.
 */

import type { DailyCheckIn, HealthDaySample, SinceComparison, SinceMeasureChange } from '@/domain/models';
import { daysBetween, type IsoDate } from '@/lib/date';
import { analyzeSymptoms, normaliseCheckIns } from './baseline';
import { sleepMeasure, symptomToMeasure, type MeasureAnalysis } from './measures';

export interface SinceInputs {
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  healthSamples?: readonly HealthDaySample[];
  anchorDate: IsoDate;
  anchorLabel: string;
}

const MIN_SIDE = 5; // days each side for a "good" comparison
const MIN_RATE_DELTA = 0.2;

/**
 * Uses a FIXED notable threshold (not the baseline-relative band) so a
 * before/after regime split can't hide the change: a symptom day is notable at
 * "a little worse" or higher (value ≥ 2); a sleep day is notable when short
 * (≤ 6 hours).
 */
function notableRate(days: { value: number }[], kind: 'sleep' | 'symptom'): number {
  if (days.length === 0) return 0;
  const notable = kind === 'sleep' ? (v: number) => v <= 6 : (v: number) => v >= 2;
  return days.filter((d) => notable(d.value)).length / days.length;
}

export function buildSinceComparison(inputs: SinceInputs): SinceComparison {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const pinnedSet = new Set(inputs.pinnedIds);
  const analysis = analyzeSymptoms(checkIns, inputs.symptomIds, pinnedSet);
  const measures: MeasureAnalysis[] = [...analysis.values()].map((a) => symptomToMeasure(a, inputs.labelOf(a.symptomId)));
  if (inputs.healthSamples) {
    const s = sleepMeasure(inputs.healthSamples);
    if (s) measures.push(s);
  }

  const changes: SinceMeasureChange[] = [];
  const unchanged: string[] = [];
  let minSide = Infinity;

  for (const m of measures) {
    const kind = m.kind === 'sleep' ? 'sleep' : 'symptom';
    const before = m.days.filter((d) => daysBetween(d.date, inputs.anchorDate) > 0);
    const after = m.days.filter((d) => daysBetween(inputs.anchorDate, d.date) > 0);
    if (before.length < 3 || after.length < 3) continue;
    minSide = Math.min(minSide, before.length, after.length);

    const delta = notableRate(before, kind) - notableRate(after, kind);
    const label = m.label;
    if (Math.abs(delta) < MIN_RATE_DELTA) {
      unchanged.push(label);
      continue;
    }
    const less = delta > 0; // fewer adverse days after
    const worseWord = m.kind === 'sleep' ? 'shorter sleep' : `worse ${label.toLowerCase()}`;
    changes.push({
      key: m.key,
      label,
      direction: less ? 'less' : 'more',
      description: less
        ? `${worseWord} recorded less often afterwards`
        : `${worseWord} recorded more often afterwards`,
    });
  }

  const dataQuality: SinceComparison['dataQuality'] =
    minSide !== Infinity && minSide >= MIN_SIDE ? 'good' : 'limited';

  return {
    anchorLabel: inputs.anchorLabel,
    anchorDate: inputs.anchorDate,
    beforeDays: measures.length ? Math.max(...measures.map((m) => m.days.filter((d) => daysBetween(d.date, inputs.anchorDate) > 0).length)) : 0,
    afterDays: measures.length ? Math.max(...measures.map((m) => m.days.filter((d) => daysBetween(inputs.anchorDate, d.date) > 0).length)) : 0,
    dataQuality,
    changes,
    unchanged,
    caveat:
      'These changes occurred during the same period. elowa cannot determine whether the event caused them.',
  };
}
