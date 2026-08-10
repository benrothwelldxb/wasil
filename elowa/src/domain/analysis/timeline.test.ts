import { describe, it, expect } from 'vitest';
import { buildTimeline, filterTimeline, groupByMonth, type TimelineInputs } from './timeline';
import { makeRun } from '@/test/factories';
import type { AppointmentRecord, TreatmentEvent } from '@/domain/models';

const labelOf = (id: string) => (id === 'sym_sleep' ? 'Sleep' : 'Hot flushes');

const treatment: TreatmentEvent = {
  id: 't1',
  category: 'hrt',
  title: 'Estradiol patch',
  date: '2026-02-10',
  dose: '50mcg',
  frequency: 'twice weekly',
};

const appointment: AppointmentRecord = {
  id: 'a1',
  date: '2026-03-01',
  clinicianName: 'Dr Rivera',
  specialty: 'Menopause clinic',
  questions: [],
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
};

const base = (over: Partial<TimelineInputs> = {}): TimelineInputs => ({
  checkIns: makeRun('2026-01-01', 40, () => ({ normal: true })),
  symptomIds: ['sym_sleep'],
  pinnedIds: ['sym_sleep'],
  labelOf,
  treatments: [],
  periods: [],
  appointments: [],
  milestones: [],
  ...over,
});

describe('buildTimeline', () => {
  it('promotes a treatment start but never everyday normal logs', () => {
    const events = buildTimeline(base({ treatments: [treatment] }));
    expect(events.some((e) => e.kind === 'treatment' && e.title === 'Estradiol patch')).toBe(true);
    // 40 normal check-ins produced zero symptom/log events.
    expect(events.every((e) => e.kind !== 'symptom_change')).toBe(true);
    expect(events.length).toBe(1);
  });

  it('promotes appointments', () => {
    const events = buildTimeline(base({ appointments: [appointment] }));
    const appt = events.find((e) => e.kind === 'appointment');
    expect(appt?.title).toContain('Dr Rivera');
  });

  it('records dose change and stop as their own moments', () => {
    const events = buildTimeline(
      base({ treatments: [{ ...treatment, doseChangeDate: '2026-03-15', endDate: '2026-04-01' }] }),
    );
    expect(events.some((e) => e.title.includes('dose changed'))).toBe(true);
    expect(events.some((e) => e.title.includes('stopped'))).toBe(true);
  });

  it('sorts most-recent first', () => {
    const events = buildTimeline(base({ treatments: [treatment], appointments: [appointment] }));
    expect(events[0]!.date >= events[events.length - 1]!.date).toBe(true);
  });
});

describe('filterTimeline', () => {
  it('filters by category', () => {
    const events = buildTimeline(base({ treatments: [treatment], appointments: [appointment] }));
    expect(filterTimeline(events, 'treatments').every((e) => e.kind === 'treatment')).toBe(true);
    expect(filterTimeline(events, 'appointments').every((e) => e.kind === 'appointment')).toBe(true);
    expect(filterTimeline(events, 'all')).toHaveLength(events.length);
  });
});

describe('groupByMonth', () => {
  it('groups into month chapters, newest first', () => {
    const events = buildTimeline(base({ treatments: [treatment], appointments: [appointment] }));
    const chapters = groupByMonth(events);
    expect(chapters[0]!.month >= chapters[chapters.length - 1]!.month).toBe(true);
    expect(chapters[0]!.label).toMatch(/\d{4}/);
  });
});
