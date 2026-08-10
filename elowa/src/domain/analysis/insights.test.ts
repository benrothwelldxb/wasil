import { describe, it, expect } from 'vitest';
import { generateInsights } from './insights';
import { findUnsafeLanguage } from '@/domain/safety/language';
import { makeRun } from '@/test/factories';
import type { PeriodEntry, TreatmentEvent } from '@/domain/models';

const SLEEP = 'sym_sleep';
const ANX = 'sym_anxiety';
const labelOf = (id: string) => (id === SLEEP ? 'Sleep' : id === ANX ? 'Anxiety' : 'Symptom');

function baseInputs(checkIns: ReturnType<typeof makeRun>, extra: Partial<Parameters<typeof generateInsights>[0]> = {}) {
  return {
    checkIns,
    symptomIds: [SLEEP, ANX],
    pinnedIds: [SLEEP, ANX],
    labelOf,
    treatments: [] as TreatmentEvent[],
    periods: [] as PeriodEntry[],
    ...extra,
  };
}

describe('generateInsights thresholds', () => {
  it('returns nothing for a tiny dataset', () => {
    const checkIns = makeRun('2026-01-01', 4, () => ({ normal: true }));
    expect(generateInsights(baseInputs(checkIns))).toEqual([]);
  });

  it('surfaces a change/frequency insight when sleep is worse than usual', () => {
    const base = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 7, (i) =>
      i < 6 ? { obs: [{ id: SLEEP, status: 'much_worse' as const }] } : { normal: true },
    );
    const insights = generateInsights(baseInputs([...base, ...bad]));
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.relatedSymptomIds?.includes(SLEEP))).toBe(true);
  });
});

describe('co-occurrence', () => {
  it('detects sleep and anxiety worsening together', () => {
    const base = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const together = makeRun('2026-01-15', 6, () => ({
      obs: [
        { id: SLEEP, status: 'much_worse' as const },
        { id: ANX, status: 'much_worse' as const },
      ],
    }));
    const insights = generateInsights(baseInputs([...base, ...together]));
    expect(insights.some((i) => i.kind === 'cooccurrence')).toBe(true);
  });
});

describe('treatment observation', () => {
  it('notes an association around a treatment change without claiming causation', () => {
    const before = makeRun('2026-01-01', 10, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const after = makeRun('2026-01-11', 10, () => ({ normal: true }));
    const treatments: TreatmentEvent[] = [
      { id: 't1', category: 'hrt', title: 'Started HRT', date: '2026-01-11' },
    ];
    const insights = generateInsights(baseInputs([...before, ...after], { treatments }));
    const treatment = insights.find((i) => i.kind === 'treatment');
    expect(treatment).toBeDefined();
    // Must include the explicit "not a cause" style framing in the body.
    expect(treatment!.body.toLowerCase()).toContain('does not establish');
  });
});

describe('safety of generated copy', () => {
  it('never emits forbidden language across a rich dataset', () => {
    const base = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 8, () => ({
      obs: [
        { id: SLEEP, status: 'much_worse' as const },
        { id: ANX, status: 'a_little_worse' as const },
      ],
    }));
    const periods: PeriodEntry[] = [
      { id: 'p1', date: '2026-01-01', flow: 'medium' },
      { id: 'p2', date: '2026-01-28', flow: 'medium' },
      { id: 'p3', date: '2026-03-05', flow: 'medium' },
    ];
    const treatments: TreatmentEvent[] = [
      { id: 't1', category: 'hrt', title: 'Started HRT', date: '2026-01-20' },
    ];
    const insights = generateInsights(baseInputs([...base, ...bad], { periods, treatments }));
    expect(insights.length).toBeGreaterThan(0);
    for (const ins of insights) {
      for (const text of [ins.title, ins.body, ins.explanation]) {
        expect(findUnsafeLanguage(text)).toEqual([]);
      }
    }
  });
});
