import { describe, it, expect } from 'vitest';
import {
  analyzeSymptoms,
  computeBaseline,
  computeOverallBaseline,
  resolveSymptomValues,
} from './baseline';
import { BASELINE } from './thresholds';
import { makeCheckIn, makeRun } from '@/test/factories';

const SLEEP = 'sym_sleep';
const pinned = new Set([SLEEP]);

describe('resolveSymptomValues', () => {
  it('resolves normal days to the neutral reference initially', () => {
    const checkIns = makeRun('2026-01-01', 3, () => ({ normal: true }));
    const values = resolveSymptomValues(checkIns, SLEEP, pinned);
    expect(values).toHaveLength(3);
    // No history + about_usual → neutral reference (Mild = 1).
    expect(values.every((v) => v.value === BASELINE.NEUTRAL_REF)).toBe(true);
  });

  it('maps explicit severity directly and anchors relative status at "usual"', () => {
    const checkIns = [
      makeCheckIn('2026-01-01', { obs: [{ id: SLEEP, severity: 'moderate' }] }), // 2 (explicit)
      makeCheckIn('2026-01-02', { obs: [{ id: SLEEP, status: 'a_little_worse' }] }), // anchor 1 + 1 = 2
      makeCheckIn('2026-01-03', { obs: [{ id: SLEEP, status: 'much_worse' }] }), // anchor 1 + 2 = 3
    ];
    const values = resolveSymptomValues(checkIns, SLEEP, pinned);
    expect(values[0]!.value).toBe(2);
    expect(values[1]!.value).toBe(2);
    expect(values[2]!.value).toBe(3);
  });

  it('ignores unobserved non-pinned symptoms', () => {
    const other = 'sym_energy';
    const checkIns = [makeCheckIn('2026-01-01', { obs: [{ id: SLEEP, status: 'much_worse' }] })];
    expect(resolveSymptomValues(checkIns, other, pinned)).toHaveLength(0);
  });
});

describe('computeBaseline states', () => {
  it('is insufficient below the minimum', () => {
    const series = Array.from({ length: BASELINE.MIN_DAYS - 1 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      value: 1,
    }));
    expect(computeBaseline(SLEEP, series).state).toBe('insufficient');
  });

  it('is learning between minimum and target', () => {
    const series = Array.from({ length: BASELINE.LEARNING_TARGET_DAYS - 1 }, (_, i) => ({
      date: `d${i}`,
      value: 1,
    }));
    expect(computeBaseline(SLEEP, series).state).toBe('learning');
  });

  it('is established at/after the target', () => {
    const series = Array.from({ length: BASELINE.LEARNING_TARGET_DAYS }, (_, i) => ({
      date: `d${i}`,
      value: 1,
    }));
    expect(computeBaseline(SLEEP, series).state).toBe('established');
  });

  it('flags recalibrating on a sustained recent rise', () => {
    const stable = Array.from({ length: 20 }, (_, i) => ({ date: `s${i}`, value: 1 }));
    const rise = Array.from({ length: 7 }, (_, i) => ({ date: `r${i}`, value: 3 }));
    expect(computeBaseline(SLEEP, [...stable, ...rise]).state).toBe('recalibrating');
  });
});

describe('analyzeSymptoms', () => {
  it('marks days above the usual range as worse', () => {
    // 14 normal days (value 1) then 3 much-worse days.
    const base = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const bad = makeRun('2026-01-15', 3, () => ({ obs: [{ id: SLEEP, status: 'much_worse' }] }));
    const analysis = analyzeSymptoms([...base, ...bad], [SLEEP], pinned);
    const sleep = analysis.get(SLEEP)!;
    const worseDays = sleep.values.filter((v) => v.worse).length;
    expect(worseDays).toBeGreaterThanOrEqual(3);
    expect(sleep.baseline.state).toBe('established');
  });
});

describe('computeOverallBaseline', () => {
  it('counts distinct days and reports state', () => {
    const checkIns = makeRun('2026-01-01', 14, () => ({ normal: true }));
    const overall = computeOverallBaseline(checkIns);
    expect(overall.distinctDays).toBe(14);
    expect(overall.state).toBe('established');
    expect(overall.daysToEstablished).toBe(0);
  });

  it('is insufficient for an empty history', () => {
    expect(computeOverallBaseline([]).state).toBe('insufficient');
  });
});
