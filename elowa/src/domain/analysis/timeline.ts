/**
 * Elowa Timeline (Phase 3) — the longitudinal story, not a calendar.
 *
 * Deterministic promotion of only *meaningful* moments: treatment changes,
 * appointments, cycle-length changes, sustained symptom shifts / returns toward
 * baseline, newly-recurring patterns, and user-pinned milestones. Everyday logs
 * are never promoted. Each event carries a `weight` used to curate the default
 * view; filters and chapters are applied by the caller/UI.
 */

import type {
  AppointmentRecord,
  DailyCheckIn,
  HealthDaySample,
  PeriodEntry,
  TimelineEvent,
  TimelineFilter,
  TreatmentEvent,
} from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { TREATMENT_CATEGORY_META } from '@/domain/constants';
import { analyzeSymptoms, normaliseCheckIns } from './baseline';
import { symptomToMeasure, sleepMeasure } from './measures';
import { detectChange, MAGNITUDE_TEXT } from './changePoint';
import { deriveCycles } from './cycle';
import { generateInsights } from './insights';

export interface TimelineInputs {
  checkIns: readonly DailyCheckIn[];
  symptomIds: readonly string[];
  pinnedIds: readonly string[];
  labelOf: (id: string) => string;
  treatments: readonly TreatmentEvent[];
  periods: readonly PeriodEntry[];
  appointments: readonly AppointmentRecord[];
  milestones: readonly TimelineEvent[];
  healthSamples?: readonly HealthDaySample[];
  excludeKeys?: ReadonlySet<string>;
}

const FILTER_KINDS: Record<Exclude<TimelineFilter, 'all'>, TimelineEvent['kind'][]> = {
  symptoms: ['symptom_change', 'baseline_shift', 'pattern'],
  cycle: ['cycle_change'],
  treatments: ['treatment'],
  appointments: ['appointment'],
  notes: ['milestone'],
};

export function buildTimeline(inputs: TimelineInputs): TimelineEvent[] {
  const checkIns = normaliseCheckIns(inputs.checkIns);
  const excluded = inputs.excludeKeys ?? new Set<string>();
  const events: TimelineEvent[] = [];

  // Treatments (start / dose change / end).
  for (const t of inputs.treatments) {
    const meta = TREATMENT_CATEGORY_META[t.category];
    events.push({
      id: `tl_trt_${t.id}`,
      date: t.date,
      kind: 'treatment',
      title: t.title,
      detail: [t.dose, t.frequency].filter(Boolean).join(' · ') || undefined,
      weight: 0.9,
      icon: meta.icon,
    });
    if (t.doseChangeDate) {
      events.push({
        id: `tl_trt_${t.id}_dose`,
        date: t.doseChangeDate,
        kind: 'treatment',
        title: `${t.title} — dose changed`,
        weight: 0.85,
        icon: meta.icon,
      });
    }
    if (t.endDate) {
      events.push({
        id: `tl_trt_${t.id}_end`,
        date: t.endDate,
        kind: 'treatment',
        title: `${t.title} — stopped`,
        weight: 0.8,
        icon: meta.icon,
      });
    }
  }

  // Appointments.
  for (const a of inputs.appointments) {
    events.push({
      id: `tl_appt_${a.id}`,
      date: a.date,
      kind: 'appointment',
      title: a.clinicianName ? `Appointment with ${a.clinicianName}` : 'Appointment',
      detail: a.specialty,
      weight: 0.88,
      icon: 'Stethoscope',
    });
  }

  // Cycle-length changes: emit an event when a completed cycle length differs
  // by ≥7 days from the one before.
  const cycles = deriveCycles(inputs.periods);
  const lengths = cycles.map((c) => ({ start: c.startDate, len: c.lengthDays }));
  for (let i = 1; i < lengths.length; i++) {
    const a = lengths[i - 1]!.len;
    const b = lengths[i]!.len;
    if (a === undefined || b === undefined) continue;
    if (Math.abs(b - a) >= 7) {
      events.push({
        id: `tl_cycle_${lengths[i]!.start}`,
        date: lengths[i]!.start,
        kind: 'cycle_change',
        title: `Cycle length changed to ${b} days`,
        detail: `Previously ${a} days`,
        weight: 0.7,
        icon: 'CalendarClock',
      });
    }
  }

  // Sustained symptom shifts / returns toward baseline.
  const analysis = analyzeSymptoms(checkIns, inputs.symptomIds, new Set(inputs.pinnedIds));
  const measures = [...analysis.values()].map((x) => symptomToMeasure(x, inputs.labelOf(x.symptomId)));
  const passiveSleep = inputs.healthSamples ? sleepMeasure(inputs.healthSamples) : null;
  if (passiveSleep) measures.push(passiveSleep);

  for (const m of measures) {
    if (excluded.has(m.key) || m.baseline.n < 12) continue;
    const cp = detectChange(m);
    if (cp.direction === 'none' || !cp.sustained) continue;
    // Approximate the change onset as the start of the recent window.
    const onset = m.days.length > cp.windowDays ? m.days[m.days.length - cp.windowDays]!.date : m.days[0]!.date;
    const adverse = m.kind === 'sleep' ? cp.direction === 'down' : cp.direction === 'up';
    events.push({
      id: `tl_change_${m.key}`,
      date: onset,
      kind: 'baseline_shift',
      title: adverse
        ? `${m.label} began appearing ${MAGNITUDE_TEXT[cp.magnitude]}`
        : `${m.label} moved back towards your usual range`,
      weight: adverse ? 0.75 : 0.72,
      icon: adverse ? 'Activity' : 'ArrowRight',
      relatedMeasureKeys: [m.key],
    });
  }

  // Newly recurring / strong patterns.
  const insights = generateInsights({
    checkIns,
    symptomIds: inputs.symptomIds,
    pinnedIds: inputs.pinnedIds,
    labelOf: inputs.labelOf,
    treatments: inputs.treatments,
    periods: inputs.periods,
    ...(inputs.healthSamples ? { healthSamples: inputs.healthSamples } : {}),
  });
  const lastDate = checkIns[checkIns.length - 1]?.date ?? '';
  for (const ins of insights.filter((i) => i.strength !== 'early' && (i.kind === 'cooccurrence' || i.kind === 'lagged'))) {
    if ((ins.relatedMeasureKeys ?? []).some((k) => excluded.has(k))) continue;
    events.push({
      id: `tl_pattern_${ins.id}`,
      date: lastDate,
      kind: 'pattern',
      title: 'A recurring pattern appeared',
      detail: ins.title,
      weight: 0.68,
      icon: 'LineChart',
      relatedMeasureKeys: ins.relatedMeasureKeys,
    });
  }

  // User milestones (pinned notes) + notes flagged in check-ins are added by caller.
  for (const m of inputs.milestones) events.push(m);

  return events
    .filter((e) => e.date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.weight - a.weight);
}

/** Apply a UI filter. */
export function filterTimeline(events: readonly TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  if (filter === 'all') return [...events];
  const kinds = FILTER_KINDS[filter];
  return events.filter((e) => kinds.includes(e.kind));
}

/** Group events into month chapters (most recent first). */
export function groupByMonth(events: readonly TimelineEvent[]): { month: string; label: string; events: TimelineEvent[] }[] {
  const byMonth = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const month = e.date.slice(0, 7);
    (byMonth.get(month) ?? byMonth.set(month, []).get(month)!).push(e);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, evs]) => {
      const [y, m] = month.split('-').map(Number);
      return {
        month,
        label: new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        events: evs,
      };
    });
}

/** Restrict the timeline to events on/after an anchor date ("Since…"). */
export function timelineSince(events: readonly TimelineEvent[], anchor: IsoDate): TimelineEvent[] {
  return events.filter((e) => e.date >= anchor);
}
