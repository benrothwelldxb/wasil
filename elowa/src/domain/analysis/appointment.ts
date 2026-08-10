/**
 * Builds an appointment summary from the user's real local data. Deterministic
 * and cautious — it reports what was recorded and observed, never a diagnosis.
 */

import type {
  AppointmentSummary,
  BaselineChange,
  DailyCheckIn,
  OnboardingReason,
  PeriodEntry,
  RankedSymptom,
  TreatmentEvent,
} from '@/domain/models';
import { analyzeSymptoms, distinctLoggedDays, normaliseCheckIns } from './baseline';
import { deriveCycles, cycleStats } from './cycle';
import { generateInsights } from './insights';
import type { IsoDate } from '@/lib/date';

export interface AppointmentInputs {
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  periods: readonly PeriodEntry[];
  questions: readonly string[];
  onboardingReasons?: readonly OnboardingReason[];
  /** Measure keys the user excluded from the report. */
  excludeKeys?: ReadonlySet<string>;
  generatedAt: string;
}

const REASON_TEXT: Record<OnboardingReason, string> = {
  periods_changed: 'changing periods',
  poor_sleep: 'sleep difficulties',
  not_myself: 'not feeling like themselves',
  hot_flushes: 'hot flushes or night sweats',
  mood_different: 'mood changes',
  low_energy: 'low energy',
  considering_hrt: 'considering HRT',
  started_hrt: 'recently starting HRT',
  understand: 'wanting to understand what’s happening',
  other: 'other reasons',
};

function contextText(reasons: readonly OnboardingReason[] | undefined): string {
  if (!reasons || reasons.length === 0) return 'The user began tracking to understand changes in their wellbeing.';
  const phrases = reasons.map((r) => REASON_TEXT[r]);
  return `The user began tracking because of ${phrases.join(', ')}.`;
}

export function cycleSummaryText(periods: readonly PeriodEntry[]): string {
  const stats = cycleStats(deriveCycles(periods));
  if (stats.recentLengths.length === 0) {
    return 'No complete cycles recorded yet.';
  }
  const lengths = stats.recentLengths.join(', ');
  const duration = stats.averagePeriodDays
    ? ` Recorded periods lasted around ${stats.averagePeriodDays} days on average.`
    : '';
  return `Last ${stats.recentLengths.length} recorded cycle length(s): ${lengths} days.${duration}`;
}

export function buildAppointmentSummary(inputs: AppointmentInputs): AppointmentSummary {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const pinnedSet = new Set(inputs.pinnedIds);
  const excluded = inputs.excludeKeys ?? new Set<string>();
  const analysis = new Map(
    [...analyzeSymptoms(checkIns, inputs.symptomIds, pinnedSet)].filter(([id]) => !excluded.has(id)),
  );

  const rangeStart = checkIns[0]?.date ?? inputs.generatedAt.slice(0, 10);
  const rangeEnd = checkIns[checkIns.length - 1]?.date ?? rangeStart;

  // Largest sustained deviations from baseline.
  const changes: BaselineChange[] = [...analysis.values()]
    .filter((a) => a.baseline.n >= 5 && Math.abs(a.baseline.recentMean - a.baseline.mean) >= 0.6)
    .sort(
      (a, b) =>
        Math.abs(b.baseline.recentMean - b.baseline.mean) -
        Math.abs(a.baseline.recentMean - a.baseline.mean),
    )
    .slice(0, 4)
    .map((a): BaselineChange => {
      const up = a.baseline.recentMean > a.baseline.mean;
      const label = inputs.labelOf(a.symptomId);
      return {
        symptomId: a.symptomId,
        label,
        direction: up ? 'up' : 'down',
        description: up
          ? `${label} has recently been above your usual range.`
          : `${label} has recently been closer to or below your usual range.`,
      };
    });

  // Most frequently disruptive symptoms (by worse-than-usual day count).
  const ranked: RankedSymptom[] = [...analysis.values()]
    .map((a) => ({
      symptomId: a.symptomId,
      label: inputs.labelOf(a.symptomId),
      worseDays: a.values.filter((v) => v.worse).length,
      total: a.values.length,
    }))
    .filter((r) => r.worseDays > 0)
    .sort((a, b) => b.worseDays - a.worseDays)
    .slice(0, 3)
    .map((r) => ({
      symptomId: r.symptomId,
      label: r.label,
      worseDays: r.worseDays,
      disruption: r.total > 0 ? r.worseDays / r.total : 0,
    }));

  const insights = generateInsights({
    checkIns,
    symptomIds: inputs.symptomIds,
    pinnedIds: inputs.pinnedIds,
    labelOf: inputs.labelOf,
    treatments: inputs.treatments,
    periods: inputs.periods,
  });

  const notes = checkIns
    .filter((c) => c.note && c.note.trim().length > 0)
    .slice(-6)
    .map((c) => ({ date: c.date as IsoDate, text: c.note!.trim() }));

  return {
    context: contextText(inputs.onboardingReasons),
    rangeStart,
    rangeEnd,
    checkInCount: checkIns.length,
    daysTracked: distinctLoggedDays(checkIns),
    changes,
    mostDisruptive: ranked,
    cycleSummary: cycleSummaryText(inputs.periods),
    treatmentEventIds: inputs.treatments.map((t) => t.id),
    observedPatterns: insights.slice(0, 4).map((i) => i.title),
    notes,
    questions: [...inputs.questions],
    generatedAt: inputs.generatedAt,
  };
}
