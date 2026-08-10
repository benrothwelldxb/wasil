import { describe, it, expect } from 'vitest';
import { buildNumericMeasure } from './measures';
import { detectChange } from './changePoint';
import { addDays } from '@/lib/date';

function series(values: number[]) {
  return values.map((value, i) => ({ date: addDays('2026-01-01', i), value }));
}

describe('detectChange', () => {
  it('reports no change for a flat series', () => {
    const m = buildNumericMeasure('x', 'X', 'symptom', series(Array(20).fill(1)));
    expect(detectChange(m).direction).toBe('none');
  });

  it('detects a sustained upward change', () => {
    const values = [...Array(14).fill(1), ...Array(7).fill(3)];
    const cp = detectChange(buildNumericMeasure('x', 'X', 'symptom', series(values)));
    expect(cp.direction).toBe('up');
    expect(cp.sustained).toBe(true);
    expect(cp.magnitude).toBe('sustained_change');
  });

  it('does NOT react to a single unusual day', () => {
    const values = [...Array(20).fill(1), 4];
    const cp = detectChange(buildNumericMeasure('x', 'X', 'symptom', series(values)));
    expect(cp.sustained).toBe(false);
    expect(['none', 'up']).toContain(cp.direction);
    // A single spike in a 7-day window can't be "sustained".
    expect(cp.magnitude).not.toBe('sustained_change');
  });

  it('requires a minimum number of days', () => {
    const cp = detectChange(buildNumericMeasure('x', 'X', 'symptom', series([1, 1, 3, 3, 3])));
    expect(cp.direction).toBe('none');
  });
});
