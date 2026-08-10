/**
 * elowa Pattern Engine v2 (deterministic).
 *
 * Produces ranked, quality-scored insight cards from the user's own local data:
 * manual symptoms + optional passive sleep/activity. It detects sustained
 * change (via change-point detection), same-day associations, lagged
 * associations (including context tags), activity↔mood links, before/after
 * treatment observations and cycle history. No LLM, no external service, no
 * randomness. Every insight carries evidence, a "what this means" note, a
 * quality `strength`, and an internal `score` used only for ranking.
 * See `docs/PATTERNS.md`.
 */

import type {
  DailyCheckIn,
  HealthDaySample,
  Insight,
  InsightFeedbackValue,
  InsightKind,
  PatternStrength,
  PeriodEntry,
  TreatmentEvent,
} from '@/domain/models';
import { addDays, daysBetween, formatDayMonth } from '@/lib/date';
import { TREATMENT_CATEGORY_META } from '@/domain/constants';
import { analyzeSymptoms, distinctLoggedDays, normaliseCheckIns } from './baseline';
import {
  activityMeasure,
  sleepMeasure,
  symptomToMeasure,
  type MeasureAnalysis,
} from './measures';
import { detectChange, MAGNITUDE_TEXT } from './changePoint';
import { deriveCycles, cycleStats } from './cycle';
import { INSIGHTS, PATTERNS } from './thresholds';
import { clamp, lastN } from './stats';
import { explanation, safeCopy, whatThisMeans } from '@/domain/safety/language';

export interface InsightInputs {
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  periods: readonly PeriodEntry[];
  healthSamples?: readonly HealthDaySample[];
  contextLabelOf?: (id: string) => string;
  learnSlugFor?: (measureKey: string) => string | undefined;
  /** Measure keys to keep off the home surface (privacy / relevance = ignore). */
  excludeKeys?: ReadonlySet<string>;
  /** Prior feedback keyed by insight key, used to adjust ranking. */
  feedback?: ReadonlyMap<string, InsightFeedbackValue>;
}

const ASSOCIATION_KINDS: ReadonlySet<InsightKind> = new Set(['cooccurrence', 'sequence', 'lagged', 'activity']);

function strengthFor(evidence: number): PatternStrength {
  if (evidence >= PATTERNS.STRONG_MIN_EVIDENCE) return 'strong';
  if (evidence >= PATTERNS.RECURRING_MIN_EVIDENCE) return 'recurring';
  return 'early';
}

function meansFor(kind: InsightKind): string {
  if (ASSOCIATION_KINDS.has(kind)) return whatThisMeans.association;
  if (kind === 'treatment') return whatThisMeans.treatment;
  if (kind === 'cycle') return whatThisMeans.cycle;
  return whatThisMeans.change;
}

/** Build an insight, filling score/strength/what-this-means consistently. */
function make(
  partial: Omit<Insight, 'strength' | 'score' | 'whatThisMeans'> & {
    evidenceCount: number;
    effect: number; // 0–1
    recency: number; // 0–1
  },
): Insight {
  const { evidenceCount, effect, recency, ...rest } = partial;
  const score = clamp(
    0.4 * Math.min(evidenceCount / 10, 1) + 0.35 * effect + 0.25 * recency,
    0,
    1,
  );
  return {
    ...rest,
    evidenceCount,
    strength: strengthFor(evidenceCount),
    score,
    whatThisMeans: meansFor(rest.kind),
  };
}

// --- change / improvement (sustained) --------------------------------------

/** Normalise a window of values to 0–1 for a sparkline (works for any units). */
function normSpark(days: { value: number }[]): number[] {
  const vals = days.map((d) => d.value);
  const mn = Math.min(...vals);
  const range = Math.max(...vals) - mn || 1;
  return vals.map((v) => (v - mn) / range);
}

function changeInsights(measures: MeasureAnalysis[], learnSlugFor?: (k: string) => string | undefined): Insight[] {
  const out: Insight[] = [];
  for (const m of measures) {
    if (m.baseline.n < INSIGHTS.MIN_LOGGED_DAYS) continue;
    // Passive activity is only used for the positive activity↔mood association,
    // never as a "you moved less" change insight (elowa is not a fitness app).
    if (m.kind === 'activity') continue;
    const cp = detectChange(m);
    if (cp.direction === 'none') continue;

    // For a symptom, "up" = worse. For sleep, "down" (shorter) is the adverse direction.
    const adverse = m.kind === 'sleep' ? cp.direction === 'down' : cp.direction === 'up';
    const evidence = cp.agreeingDays;
    const effect = clamp(Math.abs(cp.deviation) / 2, 0, 1);
    const window = lastN(m.days, 10);
    // Symptoms are on the 0–4 scale; passive sleep needs range-normalisation.
    const spark = m.kind === 'symptom' ? window.map((d) => d.value / 4) : normSpark(window);
    const learnSlug = learnSlugFor?.(m.key);

    if (m.kind === 'sleep') {
      const copy = safeCopy.sleepChange(cp.direction === 'down');
      out.push(
        make({
          id: `change_${m.key}`,
          kind: adverse ? 'change' : 'improvement',
          tone: adverse ? 'watch' : 'positive',
          title: copy.title,
          body: copy.body,
          explanation: `Your recent sleep averaged ${MAGNITUDE_TEXT[cp.magnitude]} across ${cp.windowDays} recent nights.`,
          framing: cp.sustained ? 'a sustained change' : 'a recent change',
          relatedMeasureKeys: [m.key],
          ...(learnSlug ? { learnSlug } : {}),
          spark,
          evidenceCount: evidence,
          effect,
          recency: 1,
        }),
      );
      continue;
    }

    if (adverse) {
      const copy = safeCopy.changeWorse(m.label);
      out.push(
        make({
          id: `change_${m.key}`,
          kind: 'change',
          tone: 'watch',
          title: copy.title,
          body: copy.body,
          explanation: explanation(
            `Your recent ${m.label.toLowerCase()} has been ${MAGNITUDE_TEXT[cp.magnitude]} on ${cp.agreeingDays} of ${cp.windowDays} recent check-ins`,
            'the weeks before',
          ),
          framing: cp.sustained ? 'a sustained change' : 'compared with your usual range',
          relatedSymptomIds: [m.key],
          relatedMeasureKeys: [m.key],
          ...(learnSlug ? { learnSlug } : {}),
          spark,
          evidenceCount: evidence,
          effect,
          recency: 1,
        }),
      );
    } else {
      const copy = safeCopy.improvement(m.label);
      out.push(
        make({
          id: `improvement_${m.key}`,
          kind: 'improvement',
          tone: 'positive',
          title: copy.title,
          body: copy.body,
          explanation: explanation(
            `Your recent ${m.label.toLowerCase()} check-ins have been ${MAGNITUDE_TEXT[cp.magnitude]}`,
            'the weeks before',
          ),
          framing: 'closer to usual',
          relatedSymptomIds: [m.key],
          relatedMeasureKeys: [m.key],
          ...(learnSlug ? { learnSlug } : {}),
          spark,
          evidenceCount: evidence,
          effect,
          recency: 1,
        }),
      );
    }
  }
  return out;
}

// --- frequency -------------------------------------------------------------

function frequencyInsights(measures: MeasureAnalysis[]): Insight[] {
  const out: Insight[] = [];
  for (const m of measures) {
    if (m.kind !== 'symptom') continue;
    const recent = lastN(m.days, INSIGHTS.RECENT_WINDOW);
    if (recent.length < INSIGHTS.RECENT_WINDOW) continue;
    const worse = recent.filter((d) => d.high).length;
    if (worse < INSIGHTS.FREQUENCY_MIN_DAYS) continue;
    const copy = safeCopy.frequency(m.label, worse, recent.length);
    out.push(
      make({
        id: `frequency_${m.key}`,
        kind: 'frequency',
        tone: 'watch',
        title: copy.title,
        body: copy.body,
        explanation: `Worse-than-usual ${m.label.toLowerCase()} appeared on ${worse} of your last ${recent.length} check-ins.`,
        relatedSymptomIds: [m.key],
        relatedMeasureKeys: [m.key],
        evidenceCount: worse,
        effect: clamp(worse / recent.length, 0, 1),
        recency: 1,
      }),
    );
  }
  return out;
}

// --- same-day associations -------------------------------------------------

function overlap(
  a: MeasureAnalysis,
  dirA: 'high' | 'low',
  b: MeasureAnalysis,
  dirB: 'high' | 'low',
): { both: number; aCount: number; bCount: number } {
  let both = 0;
  let aCount = 0;
  let bCount = 0;
  for (const [date, av] of a.byDate) {
    const bv = b.byDate.get(date);
    if (!bv) continue;
    const an = av[dirA];
    const bn = bv[dirB];
    if (an) aCount++;
    if (bn) bCount++;
    if (an && bn) both++;
  }
  return { both, aCount, bCount };
}

function sameDayInsights(measures: MeasureAnalysis[]): Insight[] {
  const out: { insight: Insight; both: number }[] = [];
  const symptoms = measures.filter((m) => m.kind === 'symptom');
  const sleep = measures.find((m) => m.kind === 'sleep');
  const activity = measures.find((m) => m.kind === 'activity');

  // symptom × symptom (both worse)
  for (let i = 0; i < symptoms.length; i++) {
    for (let j = i + 1; j < symptoms.length; j++) {
      const A = symptoms[i]!;
      const B = symptoms[j]!;
      const { both, aCount, bCount } = overlap(A, 'high', B, 'high');
      const minC = Math.min(aCount, bCount);
      if (both < PATTERNS.SAME_DAY_MIN || minC === 0 || both / minC < PATTERNS.SAME_DAY_MIN_RATE) continue;
      const copy = safeCopy.cooccurrence(A.label, B.label);
      out.push({
        both,
        insight: make({
          id: `cooccurrence_${A.key}_${B.key}`,
          kind: 'cooccurrence',
          tone: 'neutral',
          title: copy.title,
          body: copy.body,
          explanation: `Both were above their usual range on ${both} of the days at least one of them was.`,
          framing: 'tended to occur together',
          relatedSymptomIds: [A.key, B.key],
          relatedMeasureKeys: [A.key, B.key],
          evidenceCount: both,
          effect: clamp(both / minC, 0, 1),
          recency: 0.7,
        }),
      });
    }
  }

  // sleep (short) × symptom (worse) — skip the manual sleep symptom, which
  // measures the same thing as passive sleep and would self-associate.
  if (sleep) {
    for (const S of symptoms) {
      if (S.key === 'sym_sleep') continue;
      const { both, aCount, bCount } = overlap(sleep, 'low', S, 'high');
      const minC = Math.min(aCount, bCount);
      if (both < PATTERNS.SAME_DAY_MIN || minC === 0 || both / minC < PATTERNS.SAME_DAY_MIN_RATE) continue;
      const copy = safeCopy.cooccurrence('short sleep', S.label);
      out.push({
        both,
        insight: make({
          id: `cooccurrence_sleep_${S.key}`,
          kind: 'cooccurrence',
          tone: 'neutral',
          title: `Shorter-than-usual sleep and worse-than-usual ${S.label.toLowerCase()} have tended to appear on the same days.`,
          body: copy.body,
          explanation: `Sleep was below your usual range and ${S.label.toLowerCase()} was above its usual range on ${both} shared days.`,
          framing: 'tended to occur together',
          relatedMeasureKeys: [sleep.key, S.key],
          evidenceCount: both,
          effect: clamp(both / minC, 0, 1),
          recency: 0.7,
        }),
      });
    }
  }

  // activity (high) × mood (better) — a positive association
  if (activity) {
    const mood = symptoms.find((m) => m.key === 'sym_mood');
    if (mood) {
      const { both, aCount, bCount } = overlap(activity, 'high', mood, 'low');
      const minC = Math.min(aCount, bCount);
      if (both >= PATTERNS.SAME_DAY_MIN && minC > 0 && both / minC >= PATTERNS.SAME_DAY_MIN_RATE) {
        const copy = safeCopy.activityMood();
        out.push({
          both,
          insight: make({
            id: `activity_mood`,
            kind: 'activity',
            tone: 'positive',
            title: copy.title,
            body: copy.body,
            explanation: `On ${both} of your more-active days, mood was better than your usual range.`,
            framing: 'tended to occur together',
            relatedMeasureKeys: [activity.key, mood.key],
            evidenceCount: both,
            effect: clamp(both / minC, 0, 1),
            recency: 0.7,
          }),
        });
      }
    }
  }

  return out.sort((a, b) => b.both - a.both).slice(0, 2).map((c) => c.insight);
}

// --- lagged associations ---------------------------------------------------

function laggedInsights(
  measures: MeasureAnalysis[],
  checkIns: readonly DailyCheckIn[],
  contextLabelOf?: (id: string) => string,
): Insight[] {
  const results: Insight[] = [];

  // measure(adverse today) → next-day symptom worse
  const symptoms = measures.filter((m) => m.kind === 'symptom');
  const sleep = measures.find((m) => m.kind === 'sleep');
  const candidates: { a: MeasureAnalysis; dirA: 'high' | 'low' }[] = [
    ...(sleep ? [{ a: sleep, dirA: 'low' as const }] : []),
    ...symptoms.filter((s) => s.key === 'sym_night_sweats').map((s) => ({ a: s, dirA: 'high' as const })),
  ];
  let bestLag: { a: MeasureAnalysis; dirA: 'high' | 'low'; b: MeasureAnalysis; count: number } | null = null;
  for (const { a, dirA } of candidates) {
    for (const b of symptoms) {
      if (b.key === a.key) continue;
      // Don't lag passive sleep against the manual sleep symptom (same thing).
      if (a.kind === 'sleep' && b.key === 'sym_sleep') continue;
      let count = 0;
      for (const [date, av] of a.byDate) {
        if (!av[dirA]) continue;
        const next = b.byDate.get(addDays(date, 1));
        if (next?.high) count++;
      }
      if (count >= PATTERNS.LAGGED_MIN && (!bestLag || count > bestLag.count)) {
        bestLag = { a, dirA, b, count };
      }
    }
  }
  if (bestLag) {
    const aLabel = bestLag.a.kind === 'sleep' ? 'poor sleep' : bestLag.a.label;
    const copy = safeCopy.sequence(aLabel, bestLag.b.label);
    results.push(
      make({
        id: `lagged_${bestLag.a.key}_${bestLag.b.key}`,
        kind: 'lagged',
        tone: 'neutral',
        title: copy.title,
        body: copy.body,
        explanation: `${bestLag.b.label} was worse than usual the day after ${bestLag.count} of your ${aLabel.toLowerCase()} days.`,
        framing: 'appeared in sequence',
        relatedMeasureKeys: [bestLag.a.key, bestLag.b.key],
        evidenceCount: bestLag.count,
        effect: 0.6,
        recency: 0.6,
      }),
    );
  }

  // context tag (today) → sleep short that night
  if (sleep && contextLabelOf) {
    const byDate = new Map(normaliseCheckIns(checkIns).map((c) => [c.date, c]));
    const tagCounts = new Map<string, { tagged: number; short: number }>();
    for (const [date, ci] of byDate) {
      const sv = sleep.byDate.get(date);
      if (!sv) continue;
      for (const tag of ci.contextTagIds) {
        if (!['ctx_alcohol', 'ctx_stress', 'ctx_late_meal', 'ctx_caffeine'].includes(tag)) continue;
        const rec = tagCounts.get(tag) ?? { tagged: 0, short: 0 };
        rec.tagged++;
        if (sv.low) rec.short++;
        tagCounts.set(tag, rec);
      }
    }
    let bestTag: { tag: string; short: number; tagged: number } | null = null;
    for (const [tag, rec] of tagCounts) {
      if (rec.tagged >= PATTERNS.LAGGED_MIN && rec.short / rec.tagged >= PATTERNS.LAGGED_MIN_RATE) {
        if (!bestTag || rec.short > bestTag.short) bestTag = { tag, ...rec };
      }
    }
    if (bestTag) {
      const label = contextLabelOf(bestTag.tag);
      const copy = safeCopy.contextSleep(label);
      results.push(
        make({
          id: `context_sleep_${bestTag.tag}`,
          kind: 'lagged',
          tone: 'neutral',
          title: copy.title,
          body: copy.body,
          explanation: `Sleep was shorter than usual on ${bestTag.short} of the ${bestTag.tagged} days you tagged ${label.toLowerCase()}.`,
          framing: 'tended to occur together',
          relatedMeasureKeys: [sleep.key],
          evidenceCount: bestTag.short,
          effect: clamp(bestTag.short / bestTag.tagged, 0, 1),
          recency: 0.6,
        }),
      );
    }
  }

  return results;
}

// --- treatment before/after ------------------------------------------------

function treatmentInsights(measures: MeasureAnalysis[], treatments: readonly TreatmentEvent[]): Insight[] {
  const out: Insight[] = [];
  const notable = (v: { value: number }) => v.value >= 2;
  for (const t of treatments) {
    for (const m of measures) {
      if (m.kind !== 'symptom') continue;
      const before = m.days.filter((d) => daysBetween(d.date, t.date) > 0);
      const after = m.days.filter((d) => daysBetween(t.date, d.date) > 0);
      if (before.length < INSIGHTS.TREATMENT_MIN_DAYS_EACH_SIDE || after.length < INSIGHTS.TREATMENT_MIN_DAYS_EACH_SIDE) continue;
      const beforeRate = before.filter(notable).length / before.length;
      const afterRate = after.filter(notable).length / after.length;
      const delta = beforeRate - afterRate;
      if (Math.abs(delta) < INSIGHTS.TREATMENT_MIN_RATE_DELTA) continue;
      const direction = delta > 0 ? 'less' : 'more';
      const copy = safeCopy.treatmentObservation(
        m.label,
        `${TREATMENT_CATEGORY_META[t.category].label.toLowerCase()} change`,
        formatDayMonth(t.date),
        direction,
      );
      out.push(
        make({
          id: `treatment_${t.id}_${m.key}`,
          kind: 'treatment',
          tone: direction === 'less' ? 'positive' : 'watch',
          title: copy.title,
          body: copy.body,
          explanation: `Worse-than-usual ${m.label.toLowerCase()} on ${Math.round(beforeRate * 100)}% of days before and ${Math.round(afterRate * 100)}% of days after ${formatDayMonth(t.date)}.`,
          framing: 'observed around the same time',
          relatedSymptomIds: [m.key],
          relatedMeasureKeys: [m.key],
          evidenceCount: Math.min(before.length, after.length),
          effect: clamp(Math.abs(delta), 0, 1),
          recency: 0.8,
        }),
      );
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2);
}

// --- cycle -----------------------------------------------------------------

function cycleInsight(periods: readonly PeriodEntry[]): Insight[] {
  const stats = cycleStats(deriveCycles(periods));
  if (stats.recentLengths.length < 2) return [];
  const variable = (stats.variability ?? 0) >= 7;
  return [
    make({
      id: 'cycle_lengths',
      kind: 'cycle',
      tone: variable ? 'watch' : 'neutral',
      title: `Your last ${stats.recentLengths.length} recorded cycles were ${stats.recentLengths.join(', ')} days.`,
      body: variable
        ? 'Your recent cycle lengths have varied. This is common during the perimenopause transition.'
        : 'A record of your recent cycle lengths.',
      explanation: 'Calculated from the start dates of your recorded periods.',
      framing: 'from your recorded periods',
      learnSlug: 'cycle-changes',
      evidenceCount: stats.recentLengths.length,
      effect: variable ? 0.7 : 0.4,
      recency: 0.6,
    }),
  ];
}

// --- helpers ---------------------------------------------------------------

/** Stable key for feedback/dedup: kind + sorted measures. */
export function insightKey(ins: Insight): string {
  const keys = [...(ins.relatedMeasureKeys ?? ins.relatedSymptomIds ?? [])].sort().join('+');
  return `${ins.kind}:${keys}`;
}

function buildMeasures(inputs: InsightInputs): MeasureAnalysis[] {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const pinnedSet = new Set(inputs.pinnedIds);
  const analysis = analyzeSymptoms(checkIns, inputs.symptomIds, pinnedSet);
  const measures: MeasureAnalysis[] = [...analysis.values()].map((a) =>
    symptomToMeasure(a, inputs.labelOf(a.symptomId)),
  );
  if (inputs.healthSamples && inputs.healthSamples.length > 0) {
    const s = sleepMeasure(inputs.healthSamples);
    if (s) measures.push(s);
    const act = activityMeasure(inputs.healthSamples);
    if (act) measures.push(act);
  }
  return measures;
}

// --- orchestration ---------------------------------------------------------

export function generateInsights(inputs: InsightInputs): Insight[] {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const feedback = inputs.feedback;
  const insights: Insight[] = [];

  if (distinctLoggedDays(checkIns) >= INSIGHTS.MIN_LOGGED_DAYS) {
    const measures = buildMeasures(inputs);
    insights.push(
      ...changeInsights(measures, inputs.learnSlugFor),
      ...frequencyInsights(measures),
      ...treatmentInsights(measures, inputs.treatments),
      ...sameDayInsights(measures),
      ...laggedInsights(measures, checkIns, inputs.contextLabelOf),
    );
  }
  insights.push(...cycleInsight(inputs.periods));

  // Feedback-adjusted ranking score.
  const adjusted = insights.map((ins) => {
    const fb = feedback?.get(insightKey(ins));
    let score = ins.score;
    if (fb === 'helpful') score = clamp(score + 0.2, 0, 1);
    else if (fb === 'not_useful') score = clamp(score - 0.25, 0, 1);
    else if (fb === 'wrong') score = clamp(score - 0.5, 0, 1);
    return { ...ins, score };
  });

  // De-duplicate a measure appearing in both change and frequency (prefer the
  // higher-scored). Manual + passive sleep are treated as one family.
  const family = (key: string) => (key === 'metric_sleep' || key === 'sym_sleep' ? 'sleep' : key);
  const seen = new Set<string>();
  const deduped: Insight[] = [];
  for (const ins of adjusted.sort((a, b) => b.score - a.score)) {
    if ((ins.kind === 'change' || ins.kind === 'frequency') && ins.relatedMeasureKeys?.[0]) {
      const k = `sig_${family(ins.relatedMeasureKeys[0])}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    deduped.push(ins);
  }
  return deduped.slice(0, PATTERNS.MAX_INSIGHTS);
}

/** Insights for the home surface (respects privacy/relevance exclusions). */
export function homeInsights(inputs: InsightInputs): Insight[] {
  const excluded = inputs.excludeKeys;
  const all = generateInsights(inputs);
  if (!excluded || excluded.size === 0) return all;
  return all.filter((i) => !(i.relatedMeasureKeys ?? []).some((k) => excluded.has(k)));
}

/** The single most useful insight for Today (or null). */
export function topInsight(inputs: InsightInputs): Insight | null {
  return homeInsights(inputs)[0] ?? null;
}
