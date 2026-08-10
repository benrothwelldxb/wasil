import { describe, it, expect } from 'vitest';
import { deriveCycles, cycleStats } from './cycle';
import type { PeriodEntry } from '@/domain/models';
import { addDays } from '@/lib/date';

function bleed(start: string, days: number): PeriodEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    id: `p_${start}_${i}`,
    date: addDays(start, i),
    flow: 'medium' as const,
  }));
}

describe('deriveCycles', () => {
  it('groups bleeds and computes cycle lengths', () => {
    // starts 27 and 34 days apart
    const periods = [
      ...bleed('2026-01-01', 4),
      ...bleed('2026-01-28', 4), // 27 days
      ...bleed('2026-03-03', 5), // 34 days
    ];
    const cycles = deriveCycles(periods);
    expect(cycles).toHaveLength(3);
    expect(cycles[0]!.lengthDays).toBe(27);
    expect(cycles[1]!.lengthDays).toBe(34);
    expect(cycles[2]!.lengthDays).toBeUndefined(); // in-progress
    expect(cycles[0]!.periodDays).toBe(4);
  });

  it('bridges a short spotting gap within one bleed', () => {
    const periods = [
      { id: 'a', date: '2026-01-01', flow: 'light' as const },
      { id: 'b', date: '2026-01-03', flow: 'spotting' as const }, // 2-day gap → same bleed
    ];
    expect(deriveCycles(periods)).toHaveLength(1);
  });

  it('returns nothing for no periods', () => {
    expect(deriveCycles([])).toEqual([]);
  });
});

describe('cycleStats', () => {
  it('summarises recent lengths, variability and duration', () => {
    const periods = [
      ...bleed('2026-01-01', 4),
      ...bleed('2026-01-28', 4),
      ...bleed('2026-03-03', 5),
    ];
    const stats = cycleStats(deriveCycles(periods));
    expect(stats.recentLengths).toEqual([27, 34]);
    expect(stats.variability).toBe(7);
    expect(stats.averagePeriodDays).toBeGreaterThan(0);
  });
});
