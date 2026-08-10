/**
 * Deterministic demo dataset (~12 weeks) for a fictional user, "Sarah".
 *
 * Purely deterministic given an end date (seeded PRNG, no `Math.random`). The
 * data is designed to demonstrate: baseline establishment, changing cycle
 * lengths, worsening sleep, hot flushes, a treatment change and subsequent
 * improvement, mood/sleep co-occurrence, and several notes/context events.
 *
 * This is demo content only — it is written into the SEPARATE demo storage
 * namespace and never mixed with a real user's data.
 */

import type {
  AppointmentRecord,
  DailyCheckIn,
  HealthDaySample,
  OnboardingReason,
  PeriodEntry,
  RelativeStatus,
  SymptomObservation,
  TreatmentEvent,
  UserPreferences,
  UserProfile,
} from '@/domain/models';
import { addDays, todayIso, type IsoDate } from '@/lib/date';

export interface DemoDataset {
  profile: UserProfile;
  reasons: OnboardingReason[];
  pinnedSymptomIds: string[];
  preferences: UserPreferences;
  checkIns: DailyCheckIn[];
  periods: PeriodEntry[];
  treatments: TreatmentEvent[];
  healthSamples: HealthDaySample[];
  appointments: AppointmentRecord[];
  questions: string[];
}

const DEMO_DAYS = 84; // ~12 weeks
const PINNED = ['sym_sleep', 'sym_mood', 'sym_hot_flushes', 'sym_energy', 'sym_anxiety'];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoDataset(endDate: IsoDate = todayIso()): DemoDataset {
  const rand = mulberry32(424242);
  const startDate = addDays(endDate, -(DEMO_DAYS - 1));

  const treatments: TreatmentEvent[] = [
    {
      id: 'demo_trt_hrt',
      category: 'hrt',
      title: 'Started HRT',
      date: addDays(startDate, 45),
      dose: '25mcg estradiol patch',
      frequency: 'twice weekly',
      note: 'Started after discussing options with my GP.',
    },
    {
      id: 'demo_trt_walks',
      category: 'lifestyle',
      title: 'Started evening walks',
      date: addDays(startDate, 58),
      note: 'A short walk most evenings.',
    },
    {
      id: 'demo_trt_mag',
      category: 'supplement',
      title: 'Magnesium at night',
      date: addDays(startDate, 62),
    },
  ];
  const hrtDay = 45;

  // --- Periods (changing cycle lengths) ---
  const periodStarts = [2, 28, 61]; // lengths ~26, ~33 days
  const periods: PeriodEntry[] = [];
  for (const s of periodStarts) {
    const flows: PeriodEntry['flow'][] = ['light', 'medium', 'medium', 'light', 'spotting'];
    flows.forEach((flow, i) => {
      periods.push({ id: `demo_period_${s}_${i}`, date: addDays(startDate, s + i), flow });
    });
  }
  const periodDates = new Set(periods.map((p) => p.date));

  // --- Daily check-ins + passive health samples ---
  const checkIns: DailyCheckIn[] = [];
  const healthSamples: HealthDaySample[] = [];
  let prevSleepBad = false;

  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = addDays(startDate, i);
    const dow = new Date(`${date}T00:00:00`).getDay();
    const isWeekend = dow === 0 || dow === 6;

    // Phase-driven probabilities.
    const weeksSinceHrt = (i - hrtDay) / 7;
    let sleepBadP: number;
    let hotBadP: number;
    if (i <= 20) {
      sleepBadP = 0.12; // baseline learning: mostly normal
      hotBadP = 0.15;
    } else if (i <= hrtDay) {
      sleepBadP = 0.55; // worsening
      hotBadP = 0.6;
    } else if (weeksSinceHrt < 3) {
      sleepBadP = 0.4; // lag after treatment
      hotBadP = 0.45;
    } else {
      sleepBadP = 0.15; // improvement
      hotBadP = 0.15;
    }

    const sleepBad = rand() < sleepBadP;
    const sleepMuch = sleepBad && rand() < 0.35;

    // Passive health sample exists every day (independent of check-in logging).
    const sleepHours = sleepBad ? (sleepMuch ? 4.8 : 5.7) : 7.3 - (isWeekend ? 0 : 0.1);
    const walking = i > 58 && !isWeekend;
    healthSamples.push({
      date,
      sleepMinutes: Math.round((sleepHours + (rand() - 0.5) * 0.4) * 60),
      steps: Math.round((walking ? 8200 : 5200) + rand() * 2400),
      activeMinutes: Math.round((walking ? 35 : 18) + rand() * 12),
      restingHeartRate: Math.round(62 + rand() * 6),
    });

    // Skip ~10% of days for check-ins (non-consecutive logging), not the last 5.
    if (i < DEMO_DAYS - 5 && rand() < 0.1) {
      prevSleepBad = false;
      continue;
    }

    const hotBad = rand() < hotBadP;
    const moodBad = sleepBad && rand() < 0.7; // sleep/mood co-occurrence
    const energyBad = prevSleepBad && rand() < 0.6; // sequence: poor sleep → next-day energy
    const anxietyBad = moodBad && rand() < 0.5;

    const obs: SymptomObservation[] = [];
    const worseStatus = (much: boolean): RelativeStatus => (much ? 'much_worse' : 'a_little_worse');
    if (sleepBad) obs.push({ symptomId: 'sym_sleep', status: worseStatus(sleepMuch) });
    if (moodBad) obs.push({ symptomId: 'sym_mood', status: worseStatus(false) });
    if (hotBad) obs.push({ symptomId: 'sym_hot_flushes', status: worseStatus(rand() < 0.3) });
    if (energyBad) obs.push({ symptomId: 'sym_energy', status: 'a_little_worse' });
    if (anxietyBad) obs.push({ symptomId: 'sym_anxiety', status: 'a_little_worse' });

    // Context tags.
    const contextTagIds: string[] = [];
    if (sleepBad) contextTagIds.push('ctx_poor_sleep');
    if (isWeekend && rand() < 0.5) contextTagIds.push('ctx_alcohol');
    if (!isWeekend && i > 58 && rand() < 0.5) contextTagIds.push('ctx_exercise');
    if (rand() < 0.1) contextTagIds.push('ctx_stress');
    if (periodDates.has(date)) contextTagIds.push('ctx_period');
    if (i === hrtDay) contextTagIds.push('ctx_hrt_change');

    // Notes on a few notable days.
    let note: string | undefined;
    if (i === 30) note = 'Rough night — awake from 3am, then hot and clammy.';
    else if (i === hrtDay) note = 'Started HRT today. Hoping the night sweats settle.';
    else if (i === 72) note = 'Slept much better this week. Feeling more like myself.';

    const kind = obs.length === 0 ? 'normal' : 'detailed';
    const stamp = `${date}T20:00:00.000Z`;
    checkIns.push({
      id: `demo_checkin_${date}`,
      date,
      kind,
      feltNormal: kind === 'normal',
      observations: obs,
      contextTagIds,
      ...(note ? { note } : {}),
      createdAt: stamp,
      updatedAt: stamp,
    });

    prevSleepBad = sleepBad;
  }

  // --- Appointments (a past GP visit where HRT began, and an upcoming review) ---
  const appointments: AppointmentRecord[] = [
    {
      id: 'demo_appt_gp',
      date: addDays(startDate, 44),
      clinicianName: 'Dr Aisha Rahman',
      specialty: 'GP',
      reason: 'Sleep, night sweats and low mood',
      questions: ['Could this be perimenopause?', 'What are my options for the night sweats?'],
      outcomes: ['Started estradiol patch (25mcg, twice weekly)', 'Review in 8 weeks'],
      followUpDate: addDays(startDate, 100),
      createdAt: `${addDays(startDate, 44)}T09:00:00.000Z`,
      updatedAt: `${addDays(startDate, 46)}T09:00:00.000Z`,
    },
    {
      id: 'demo_appt_review',
      date: addDays(endDate, 12),
      clinicianName: 'Dr Aisha Rahman',
      specialty: 'GP',
      reason: 'HRT review',
      questions: ['Is my current dose right?', 'Should I be worried about my changing cycle length?'],
      createdAt: `${endDate}T09:00:00.000Z`,
      updatedAt: `${endDate}T09:00:00.000Z`,
    },
  ];

  return {
    profile: { displayName: 'Sarah', age: 47 },
    reasons: ['poor_sleep', 'hot_flushes'] as OnboardingReason[],
    pinnedSymptomIds: PINNED,
    preferences: { remindersEnabled: false, cycleTrackingEnabled: true },
    checkIns,
    periods,
    treatments,
    healthSamples,
    appointments,
    questions: [
      'Is my current HRT dose right for me?',
      'Should I be concerned about how much my cycle length is changing?',
    ],
  };
}

export { DEMO_DAYS };
