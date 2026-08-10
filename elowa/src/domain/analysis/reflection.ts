/**
 * Monthly reflection generator (Phase 2, deterministic).
 *
 * Summarises a calendar month from the user's own data: what stayed steady,
 * what changed, a pattern worth noticing, treatment and cycle notes, and a
 * gentle "for next month" nudge. AI (if enabled) may only reword this.
 */

import type {
  DailyCheckIn,
  HealthDaySample,
  MonthlyReflection,
  PeriodEntry,
  TreatmentEvent,
} from '@/domain/models';
import { formatDayMonth, type IsoDate } from '@/lib/date';
import { analyzeSymptoms, normaliseCheckIns } from './baseline';
import { symptomToMeasure } from './measures';
import { detectChange, MAGNITUDE_TEXT } from './changePoint';
import { generateInsights } from './insights';
import { deriveCycles, cycleStats } from './cycle';

export interface ReflectionInputs {
  month: string; // `YYYY-MM`
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  periods: readonly PeriodEntry[];
  healthSamples?: readonly HealthDaySample[];
}

function inMonth(date: IsoDate, month: string): boolean {
  return date.startsWith(month);
}

export function buildMonthlyReflection(inputs: ReflectionInputs): MonthlyReflection {
  const monthCheckIns = normaliseCheckIns(inputs.checkIns).filter((c) => inMonth(c.date, inputs.month));
  const [year, m] = inputs.month.split('-').map(Number);
  const monthLabel = new Date(year!, (m ?? 1) - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const analysis = analyzeSymptoms(inputs.checkIns, inputs.symptomIds, new Set(inputs.pinnedIds));
  const measures = [...analysis.values()].map((a) => symptomToMeasure(a, inputs.labelOf(a.symptomId)));

  const steady: string[] = [];
  const changed: string[] = [];
  for (const meas of measures) {
    if (meas.baseline.n < 8) continue;
    const cp = detectChange(meas);
    if (cp.direction === 'none') {
      steady.push(`${meas.label} was mostly within your usual range.`);
    } else {
      const adverse = cp.direction === 'up';
      changed.push(
        `${meas.label} was ${MAGNITUDE_TEXT[cp.magnitude]}${adverse ? '' : ' (closer to usual)'} later in the period.`,
      );
    }
  }

  const insights = generateInsights({
    checkIns: inputs.checkIns,
    symptomIds: inputs.symptomIds,
    pinnedIds: inputs.pinnedIds,
    labelOf: inputs.labelOf,
    treatments: inputs.treatments,
    periods: inputs.periods,
    ...(inputs.healthSamples ? { healthSamples: inputs.healthSamples } : {}),
  });
  const patterns = insights.filter((i) => i.kind === 'cooccurrence' || i.kind === 'lagged' || i.kind === 'activity').slice(0, 2).map((i) => i.title);

  const treatmentNotes = inputs.treatments
    .filter((t) => inMonth(t.date, inputs.month))
    .map((t) => `${t.title} on ${formatDayMonth(t.date)}.`);

  const cycles = deriveCycles(inputs.periods);
  const stats = cycleStats(cycles);
  const cycleNote =
    stats.recentLengths.length > 0
      ? `Recent recorded cycle length(s): ${stats.recentLengths.join(', ')} days.`
      : undefined;

  return {
    month: inputs.month,
    monthLabel,
    checkInCount: monthCheckIns.length,
    steady: steady.slice(0, 3),
    changed: changed.slice(0, 3),
    patterns,
    treatmentNotes,
    ...(cycleNote ? { cycleNote } : {}),
    nextMonth:
      'Keep checking in so elowa can see whether these patterns continue. A few seconds a day is enough.',
  };
}
