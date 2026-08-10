import { describe, it, expect } from 'vitest';
import { generateInsights, homeInsights, insightKey } from './insights';
import { findUnsafeLanguage } from '@/domain/safety/language';
import { makeRun, makeCheckIn } from '@/test/factories';
import { addDays } from '@/lib/date';
import type { HealthDaySample } from '@/domain/models';

const SLEEP = 'sym_sleep';
const MOOD = 'sym_mood';
const labelOf = (id: string) => (id === SLEEP ? 'Sleep' : id === MOOD ? 'Mood' : 'Symptom');

function base(extra: Partial<Parameters<typeof generateInsights>[0]> = {}) {
  return {
    checkIns: [],
    symptomIds: [SLEEP, MOOD],
    pinnedIds: [SLEEP, MOOD],
    labelOf,
    treatments: [],
    periods: [],
    ...extra,
  };
}

describe('pattern engine v2', () => {
  it('ranks insights by score and assigns strength', () => {
    const b = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 8, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const insights = generateInsights(base({ checkIns: [...b, ...bad] }));
    expect(insights.length).toBeGreaterThan(0);
    // Sorted by score descending.
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1]!.score).toBeGreaterThanOrEqual(insights[i]!.score);
    }
    expect(['early', 'recurring', 'strong']).toContain(insights[0]!.strength);
    expect(insights[0]!.whatThisMeans).toBeTruthy();
  });

  it('finds a lagged sleep→next-day energy pattern via passive sleep', () => {
    // 20 days: alternate short/long sleep; energy worse the day after short sleep.
    const checkIns = [];
    const samples: HealthDaySample[] = [];
    for (let i = 0; i < 24; i++) {
      const date = addDays('2026-02-01', i);
      const short = i % 2 === 0;
      samples.push({ date, sleepMinutes: short ? 300 : 460 });
      // energy worse the day after a short-sleep night
      const prevShort = i > 0 && (i - 1) % 2 === 0;
      checkIns.push(
        prevShort
          ? makeCheckIn(date, { obs: [{ id: 'sym_energy', status: 'a_little_worse' }] })
          : makeCheckIn(date, { normal: true }),
      );
    }
    const insights = generateInsights(
      base({ checkIns, symptomIds: [SLEEP, 'sym_energy'], pinnedIds: ['sym_energy'], healthSamples: samples, labelOf: (id) => (id === 'sym_energy' ? 'Energy' : 'Sleep') }),
    );
    expect(insights.some((i) => i.kind === 'lagged' || i.kind === 'cooccurrence')).toBe(true);
  });

  it('respects home exclusions', () => {
    const b = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 8, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const all = generateInsights(base({ checkIns: [...b, ...bad] }));
    const home = homeInsights(base({ checkIns: [...b, ...bad], excludeKeys: new Set([SLEEP]) }));
    expect(all.some((i) => i.relatedMeasureKeys?.includes(SLEEP))).toBe(true);
    expect(home.some((i) => i.relatedMeasureKeys?.includes(SLEEP))).toBe(false);
  });

  it('generates a stable insight key for feedback', () => {
    const b = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 8, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const insights = generateInsights(base({ checkIns: [...b, ...bad] }));
    const key = insightKey(insights[0]!);
    expect(key).toMatch(/:/);
  });

  it('never emits unsafe language including passive-data insights', () => {
    const checkIns = [];
    const samples: HealthDaySample[] = [];
    for (let i = 0; i < 24; i++) {
      const date = addDays('2026-03-01', i);
      const bad = i >= 14;
      samples.push({ date, sleepMinutes: bad ? 300 : 450, steps: bad ? 3000 : 9000 });
      checkIns.push(bad ? makeCheckIn(date, { obs: [{ id: MOOD, status: 'much_worse' }] }) : makeCheckIn(date, { normal: true }));
    }
    const insights = generateInsights(base({ checkIns, healthSamples: samples }));
    for (const ins of insights) {
      for (const t of [ins.title, ins.body, ins.explanation, ins.whatThisMeans ?? '']) {
        expect(findUnsafeLanguage(t)).toEqual([]);
      }
    }
  });
});
