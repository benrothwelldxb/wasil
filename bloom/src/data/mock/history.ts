/**
 * Deterministically-seeded mock history for Emma.
 *
 * This is NOT a simulation engine — it is a small, reproducible generator that
 * builds ~12 weeks of daily check-ins with *deliberately recognisable* patterns
 * so the Insights and Appointment screens look meaningful:
 *
 *   1. Night sweats & hot flushes are frequent early, then ease ~3 weeks after
 *      HRT starts (12 Mar) and the dose is adjusted (8 Apr).
 *   2. Sleep and mood move together — poorer sleep nights coincide with lower
 *      mood.
 *   3. Cycles are irregular (23–45 days) with two recorded periods.
 *
 * Everything is derived from a fixed seed, so the dataset never changes between
 * loads and no `Math.random()` is used.
 */

import type {
  CycleEntry,
  DailyCheckIn,
  PeriodEntry,
  Severity,
  SymptomEntry,
  WellbeingLevel,
} from '@/domain/models';
import { addDays, type IsoDate } from '@/lib/date';
import { MOCK_TODAY } from './user';

// --- Deterministic PRNG (mulberry32) --------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HISTORY_START: IsoDate = '2026-03-01';
const HRT_START: IsoDate = '2026-03-12';

function daysBetween(a: IsoDate, b: IsoDate): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / 86_400_000);
}

const SEVERITIES: Severity[] = ['none', 'mild', 'moderate', 'strong', 'severe'];

function toSeverity(score: number): Severity {
  const clamped = Math.max(0, Math.min(4, Math.round(score)));
  return SEVERITIES[clamped]!;
}

// --- Period / cycle data (irregular, 23–45 days) ---------------------------

interface PeriodSpec {
  start: IsoDate;
  /** Flow per day from the start. */
  flows: PeriodEntry['flow'][];
}

const PERIOD_SPECS: PeriodSpec[] = [
  { start: '2026-02-24', flows: ['light', 'medium', 'medium', 'light', 'spotting'] },
  { start: '2026-03-19', flows: ['spotting', 'light', 'medium', 'light', 'spotting'] }, // 23-day cycle
  { start: '2026-05-03', flows: ['light', 'medium', 'medium', 'medium', 'light', 'spotting'] }, // 45-day cycle
];

export const MOCK_PERIODS: readonly PeriodEntry[] = PERIOD_SPECS.flatMap((spec) =>
  spec.flows.map((flow, i) => ({
    id: `period_${spec.start}_${i}`,
    date: addDays(spec.start, i),
    flow,
  })),
);

export const MOCK_CYCLES: readonly CycleEntry[] = PERIOD_SPECS.map((spec, i) => {
  const next = PERIOD_SPECS[i + 1];
  const lengthDays = next ? daysBetween(spec.start, next.start) : undefined;
  const bleedEndDate = addDays(spec.start, spec.flows.length - 1);
  return {
    id: `cycle_${spec.start}`,
    startDate: spec.start,
    bleedEndDate,
    ...(lengthDays !== undefined ? { lengthDays } : {}),
  };
});

const PERIOD_DATES = new Set(MOCK_PERIODS.map((p) => p.date));

// --- Daily check-in generation --------------------------------------------

function wellbeingFrom(avgBurden: number, flagged: boolean): WellbeingLevel {
  if (flagged || avgBurden >= 2.6) return 'rough';
  if (avgBurden >= 1.8) return 'not_great';
  if (avgBurden >= 0.9) return 'okay';
  return 'great';
}

function buildCheckIns(): DailyCheckIn[] {
  const rand = mulberry32(20260522);
  const totalDays = daysBetween(HISTORY_START, MOCK_TODAY);
  const hrtDay = daysBetween(HISTORY_START, HRT_START);
  const checkIns: DailyCheckIn[] = [];

  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(HISTORY_START, i);
    const dow = new Date(`${date}T00:00:00`).getDay(); // 0 Sun .. 6 Sat
    const isWeekend = dow === 5 || dow === 6;

    // Skip a handful of days to feel realistic (never the most recent week).
    const isRecentWeek = totalDays - i < 7;
    if (!isRecentWeek && rand() < 0.12) continue;

    // Vasomotor burden: high early, tapering after HRT + ~3 weeks.
    const weeksSinceHrt = (i - hrtDay) / 7;
    const vasomotorBase =
      weeksSinceHrt < 0 ? 3.1 : Math.max(0.4, 3.1 - Math.max(0, weeksSinceHrt - 1) * 0.5);

    // Alcohol tends to fall on weekends (less so after the 22 Apr change).
    const reducedAlcohol = date >= '2026-04-22';
    const drankAlcohol = isWeekend && rand() < (reducedAlcohol ? 0.5 : 0.8);

    // Sleep: worse with alcohol, vasomotor and random noise.
    const sleepNoise = rand();
    const sleepScore =
      0.6 +
      vasomotorBase * 0.35 +
      (drankAlcohol ? 1.0 : 0) +
      sleepNoise * 1.4 -
      (date >= '2026-05-02' ? 0.4 : 0); // evening walks help a little

    // Mood tracks sleep closely (the headline association), plus mild noise.
    const moodScore = sleepScore * 0.7 + rand() * 0.8 - 0.2;

    // Energy: inverse of sleep + noise.
    const energyScore = sleepScore * 0.6 + rand() * 0.7;

    const hotFlushScore = vasomotorBase + (drankAlcohol ? 0.6 : 0) + rand() * 0.5 - 0.3;
    const nightSweatScore = vasomotorBase + (drankAlcohol ? 0.5 : 0) + rand() * 0.5 - 0.5;

    // Pain / bloating rise around period days.
    const nearPeriod = PERIOD_DATES.has(date) || PERIOD_DATES.has(addDays(date, 1)) || PERIOD_DATES.has(addDays(date, -1));
    const painScore = (nearPeriod ? 1.8 : 0.6) + rand() * 1.1;
    const bloatScore = (nearPeriod ? 2.0 : 0.7) + rand() * 1.0;

    const symptoms: SymptomEntry[] = [
      { symptomId: 'sym_sleep', severity: toSeverity(sleepScore) },
      { symptomId: 'sym_mood', severity: toSeverity(moodScore) },
      { symptomId: 'sym_energy', severity: toSeverity(energyScore) },
      { symptomId: 'sym_hot_flushes', severity: toSeverity(hotFlushScore) },
      { symptomId: 'sym_pain', severity: toSeverity(painScore) },
      { symptomId: 'sym_bloating', severity: toSeverity(bloatScore) },
      { symptomId: 'sym_night_sweats', severity: toSeverity(nightSweatScore) },
    ];

    // Context tags reflect the day.
    const contextTagIds: string[] = [];
    if (sleepScore >= 2) contextTagIds.push('ctx_poor_sleep');
    if (drankAlcohol) contextTagIds.push('ctx_alcohol');
    if (!isWeekend && date >= '2026-05-02' && rand() < 0.6) contextTagIds.push('ctx_exercise');
    if (rand() < 0.12) contextTagIds.push('ctx_stress');
    if (date === '2026-03-12' || date === '2026-04-08') contextTagIds.push('ctx_hrt_change');

    const burdenValues = [sleepScore, moodScore, hotFlushScore, painScore];
    const avgBurden = burdenValues.reduce((a, b) => a + b, 0) / burdenValues.length;

    // Flag a couple of clearly unusual days for the calendar / analysis.
    const flaggedUnusual = date === '2026-03-14' || date === '2026-04-06';

    checkIns.push({
      id: `checkin_${date}`,
      date,
      wellbeing: wellbeingFrom(avgBurden, flaggedUnusual),
      symptoms,
      contextTagIds,
      flaggedUnusual,
      ...(flaggedUnusual
        ? { note: 'Barely slept — awake from 3am, drenched. Rough day.' }
        : rand() < 0.08
          ? { note: 'Felt a bit more like myself today.' }
          : {}),
      completedAt: `${date}T20:30:00.000Z`,
    });
  }

  return checkIns;
}

export const MOCK_CHECKINS: readonly DailyCheckIn[] = buildCheckIns();

/** Convenience: the check-in for a given date, if it exists. */
export function checkInForDate(date: IsoDate): DailyCheckIn | undefined {
  return MOCK_CHECKINS.find((c) => c.date === date);
}
