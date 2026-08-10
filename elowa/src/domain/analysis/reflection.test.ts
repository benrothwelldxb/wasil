import { describe, it, expect } from 'vitest';
import { buildMonthlyReflection } from './reflection';
import { makeRun } from '@/test/factories';

const SLEEP = 'sym_sleep';
const labelOf = () => 'Sleep';

describe('buildMonthlyReflection', () => {
  it('summarises a month with steady and changed items', () => {
    const early = makeRun('2026-04-01', 14, () => ({ normal: true }));
    const worse = makeRun('2026-04-15', 8, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const reflection = buildMonthlyReflection({
      month: '2026-04',
      checkIns: [...early, ...worse],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      treatments: [],
      periods: [],
    });
    expect(reflection.month).toBe('2026-04');
    expect(reflection.checkInCount).toBeGreaterThan(0);
    expect(reflection.changed.length + reflection.steady.length).toBeGreaterThan(0);
    expect(reflection.nextMonth.length).toBeGreaterThan(0);
  });

  it('handles an empty month', () => {
    const reflection = buildMonthlyReflection({
      month: '2026-07',
      checkIns: [],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      treatments: [],
      periods: [],
    });
    expect(reflection.checkInCount).toBe(0);
  });
});
