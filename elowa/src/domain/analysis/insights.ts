/**
 * elowa deterministic insights engine.
 *
 * Generates candidate insight cards from the user's own local data only. No
 * LLM, no external service, no randomness. Every insight carries a plain-text
 * `explanation` (the evidence behind it) and a `confidence` level, and all copy
 * is built from the safe-language templates. Thresholds live in `thresholds.ts`
 * so nothing is presented until there is enough signal — see `docs/INSIGHTS.md`.
 */

import type { DailyCheckIn, Insight, PeriodEntry, TreatmentEvent } from '@/domain/models';
import { addDays, daysBetween, formatDayMonth, type IsoDate } from '@/lib/date';
import { TREATMENT_CATEGORY_META } from '@/domain/constants';
import { analyzeSymptoms, distinctLoggedDays, normaliseCheckIns, type SymptomAnalysis } from './baseline';
import { deriveCycles, cycleStats } from './cycle';
import { INSIGHTS } from './thresholds';
import { explanation, safeCopy } from '@/domain/safety/language';
import { lastN } from './stats';

export interface InsightInputs {
  checkIns: readonly DailyCheckIn[];
  /** Symptoms to analyse (pinned + any that appear in observations). */
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  periods: readonly PeriodEntry[];
}

function confidenceFor(evidence: number): Insight['confidence'] {
  return evidence >= INSIGHTS.RECURRING_MIN_EVIDENCE ? 'recurring_pattern' : 'early_signal';
}

function countWorse(values: { worse: boolean }[]): number {
  return values.filter((v) => v.worse).length;
}

// --- individual generators -------------------------------------------------

function changeInsights(analysis: Map<string, SymptomAnalysis>, labelOf: (id: string) => string): Insight[] {
  const out: Insight[] = [];
  for (const a of analysis.values()) {
    if (a.baseline.n < INSIGHTS.MIN_LOGGED_DAYS) continue;
    const deviation = a.baseline.recentMean - a.baseline.mean;
    const recent = lastN(a.values, INSIGHTS.RECENT_WINDOW);
    const previous = lastN(a.values.slice(0, a.values.length - recent.length), INSIGHTS.PREVIOUS_WINDOW);
    const recentWorse = countWorse(recent);
    const prevWorse = countWorse(previous);
    const label = labelOf(a.symptomId);

    if (deviation >= INSIGHTS.CHANGE_MIN_DELTA) {
      const copy = safeCopy.changeWorse(label);
      out.push({
        id: `change_${a.symptomId}`,
        kind: 'change',
        tone: 'watch',
        confidence: confidenceFor(recentWorse),
        title: copy.title,
        body: copy.body,
        explanation: explanation(
          `You recorded ${label.toLowerCase()} above your usual range on ${recentWorse} of the last ${recent.length} check-ins`,
          `${prevWorse} of the previous ${previous.length || 0}`,
        ),
        framing: 'compared with your usual range',
        relatedSymptomIds: [a.symptomId],
        spark: recent.map((v) => v.value / 4),
      });
    } else if (deviation <= -INSIGHTS.IMPROVEMENT_MIN_DELTA) {
      const copy = safeCopy.improvement(label);
      out.push({
        id: `improvement_${a.symptomId}`,
        kind: 'improvement',
        tone: 'positive',
        confidence: confidenceFor(recent.length),
        title: copy.title,
        body: copy.body,
        explanation: explanation(
          `Your recent ${label.toLowerCase()} check-ins averaged closer to your usual range`,
          `the weeks before`,
        ),
        framing: 'closer to usual',
        relatedSymptomIds: [a.symptomId],
        spark: recent.map((v) => v.value / 4),
      });
    }
  }
  return out;
}

function frequencyInsights(analysis: Map<string, SymptomAnalysis>, labelOf: (id: string) => string): Insight[] {
  const out: Insight[] = [];
  for (const a of analysis.values()) {
    const recent = lastN(a.values, INSIGHTS.RECENT_WINDOW);
    if (recent.length < INSIGHTS.RECENT_WINDOW) continue;
    const worse = countWorse(recent);
    if (worse < INSIGHTS.FREQUENCY_MIN_DAYS) continue;
    const label = labelOf(a.symptomId);
    const copy = safeCopy.frequency(label, worse, recent.length);
    out.push({
      id: `frequency_${a.symptomId}`,
      kind: 'frequency',
      tone: 'watch',
      confidence: confidenceFor(worse),
      title: copy.title,
      body: copy.body,
      explanation: `Worse-than-usual ${label.toLowerCase()} appeared on ${worse} of your last ${recent.length} check-ins.`,
      relatedSymptomIds: [a.symptomId],
    });
  }
  return out;
}

function cooccurrenceInsights(
  analysis: Map<string, SymptomAnalysis>,
  labelOf: (id: string) => string,
): Insight[] {
  const ids = [...analysis.keys()];
  const candidates: { insight: Insight; both: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = analysis.get(ids[i]!)!;
      const B = analysis.get(ids[j]!)!;
      let both = 0;
      let aWorse = 0;
      let bWorse = 0;
      for (const [date, av] of A.byDate) {
        const bv = B.byDate.get(date);
        if (!bv) continue;
        if (av.worse) aWorse++;
        if (bv.worse) bWorse++;
        if (av.worse && bv.worse) both++;
      }
      const minWorse = Math.min(aWorse, bWorse);
      if (both < INSIGHTS.COOCCURRENCE_MIN_DAYS || minWorse === 0) continue;
      if (both / minWorse < INSIGHTS.COOCCURRENCE_MIN_RATE) continue;
      const copy = safeCopy.cooccurrence(labelOf(A.symptomId), labelOf(B.symptomId));
      candidates.push({
        both,
        insight: {
          id: `cooccurrence_${A.symptomId}_${B.symptomId}`,
          kind: 'cooccurrence',
          tone: 'neutral',
          confidence: confidenceFor(both),
          title: copy.title,
          body: copy.body,
          explanation: `Both were above their usual range on ${both} of the days at least one of them was.`,
          framing: 'tended to occur together',
          relatedSymptomIds: [A.symptomId, B.symptomId],
        },
      });
    }
  }
  // Keep only the strongest co-occurrence to avoid overload.
  return candidates.sort((a, b) => b.both - a.both).slice(0, 1).map((c) => c.insight);
}

function sequenceInsights(
  analysis: Map<string, SymptomAnalysis>,
  labelOf: (id: string) => string,
): Insight[] {
  const ids = [...analysis.keys()];
  let best: { a: string; b: string; count: number } | null = null;
  for (const aId of ids) {
    for (const bId of ids) {
      if (aId === bId) continue;
      const A = analysis.get(aId)!;
      const B = analysis.get(bId)!;
      let count = 0;
      for (const [date, av] of A.byDate) {
        if (!av.worse) continue;
        const next = B.byDate.get(addDays(date, 1));
        if (next?.worse) count++;
      }
      if (count >= INSIGHTS.SEQUENCE_MIN_OCCURRENCES && (!best || count > best.count)) {
        best = { a: aId, b: bId, count };
      }
    }
  }
  if (!best) return [];
  const copy = safeCopy.sequence(labelOf(best.a), labelOf(best.b));
  return [
    {
      id: `sequence_${best.a}_${best.b}`,
      kind: 'sequence',
      tone: 'neutral',
      confidence: confidenceFor(best.count),
      title: copy.title,
      body: copy.body,
      explanation: `${labelOf(best.b)} was worse-than-usual the day after ${best.count} of your worse-than-usual ${labelOf(best.a).toLowerCase()} days.`,
      framing: 'appeared in sequence',
      relatedSymptomIds: [best.a, best.b],
    },
  ];
}

function treatmentInsights(
  analysis: Map<string, SymptomAnalysis>,
  treatments: readonly TreatmentEvent[],
  labelOf: (id: string) => string,
): Insight[] {
  const out: Insight[] = [];
  // "Notable" = at least a-little-worse on the anchored scale (value >= 2),
  // independent of the global baseline so before/after regimes compare fairly.
  const notable = (v: { value: number }) => v.value >= 2;
  for (const t of treatments) {
    for (const a of analysis.values()) {
      const before = a.values.filter((v) => daysBetween(v.date, t.date) > 0);
      const after = a.values.filter((v) => daysBetween(t.date, v.date) > 0);
      if (
        before.length < INSIGHTS.TREATMENT_MIN_DAYS_EACH_SIDE ||
        after.length < INSIGHTS.TREATMENT_MIN_DAYS_EACH_SIDE
      ) {
        continue;
      }
      const beforeRate = before.filter(notable).length / before.length;
      const afterRate = after.filter(notable).length / after.length;
      const delta = beforeRate - afterRate;
      if (Math.abs(delta) < INSIGHTS.TREATMENT_MIN_RATE_DELTA) continue;
      const direction = delta > 0 ? 'less' : 'more';
      const label = labelOf(a.symptomId);
      const copy = safeCopy.treatmentObservation(
        label,
        `${TREATMENT_CATEGORY_META[t.category].label.toLowerCase()} change`,
        formatDayMonth(t.date),
        direction,
      );
      out.push({
        id: `treatment_${t.id}_${a.symptomId}`,
        kind: 'treatment',
        tone: direction === 'less' ? 'positive' : 'watch',
        confidence: confidenceFor(Math.min(before.length, after.length)),
        title: copy.title,
        body: copy.body,
        explanation: `Worse-than-usual ${label.toLowerCase()} on ${Math.round(beforeRate * 100)}% of days before and ${Math.round(afterRate * 100)}% of days after ${formatDayMonth(t.date)}.`,
        framing: 'observed around the same time',
        relatedSymptomIds: [a.symptomId],
      });
    }
  }
  // At most two treatment observations to avoid overload.
  return out.slice(0, 2);
}

function cycleInsight(periods: readonly PeriodEntry[]): Insight[] {
  const cycles = deriveCycles(periods);
  const stats = cycleStats(cycles);
  if (stats.recentLengths.length < 2) return [];
  const lengths = stats.recentLengths.join(', ');
  const variable = (stats.variability ?? 0) >= 7;
  return [
    {
      id: 'cycle_lengths',
      kind: 'cycle',
      tone: variable ? 'watch' : 'neutral',
      confidence: stats.recentLengths.length >= 3 ? 'recurring_pattern' : 'early_signal',
      title: `Your last ${stats.recentLengths.length} recorded cycles were ${lengths} days.`,
      body: variable
        ? 'Your recent cycle lengths have varied. This is common during the perimenopause transition.'
        : 'A record of your recent cycle lengths.',
      explanation: `Calculated from the start dates of your recorded periods.`,
      framing: 'from your recorded periods',
    },
  ];
}

// --- orchestration ---------------------------------------------------------

const KIND_PRIORITY: Record<Insight['kind'], number> = {
  change: 0,
  frequency: 1,
  treatment: 2,
  cycle: 3,
  cooccurrence: 4,
  sequence: 5,
  improvement: 6,
};

export function generateInsights(inputs: InsightInputs): Insight[] {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const pinnedSet = new Set(inputs.pinnedIds);
  const insights: Insight[] = [];

  // Symptom-based insights require a minimum amount of history.
  if (distinctLoggedDays(checkIns) >= INSIGHTS.MIN_LOGGED_DAYS) {
    const analysis = analyzeSymptoms(checkIns, inputs.symptomIds, pinnedSet);
    insights.push(
      ...changeInsights(analysis, inputs.labelOf),
      ...frequencyInsights(analysis, inputs.labelOf),
      ...treatmentInsights(analysis, inputs.treatments, inputs.labelOf),
      ...cooccurrenceInsights(analysis, inputs.labelOf),
      ...sequenceInsights(analysis, inputs.labelOf),
    );
  }

  // Cycle insight has its own (cycle-count) gate.
  insights.push(...cycleInsight(inputs.periods));

  // De-duplicate a symptom appearing in both change and frequency (prefer change).
  const seenSymptom = new Set<string>();
  const deduped: Insight[] = [];
  for (const ins of insights.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])) {
    if ((ins.kind === 'change' || ins.kind === 'frequency') && ins.relatedSymptomIds?.[0]) {
      const key = `sym_signal_${ins.relatedSymptomIds[0]}`;
      if (seenSymptom.has(key)) continue;
      seenSymptom.add(key);
    }
    deduped.push(ins);
  }
  return deduped;
}

/** Convenience: the single most useful insight for the Today screen (or null). */
export function topInsight(inputs: InsightInputs): Insight | null {
  return generateInsights(inputs)[0] ?? null;
}

export type { IsoDate };
