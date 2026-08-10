import { describe, it, expect } from 'vitest';
import { buildChangeSummary } from './howChanged';
import { findUnsafeLanguage } from '@/domain/safety/language';
import { makeRun } from '@/test/factories';

const SLEEP = 'sym_sleep';
const labelOf = () => 'Sleep';

describe('buildChangeSummary', () => {
  it('marks a measure "improved" when notable days fall in the later half', () => {
    const first = makeRun('2026-01-01', 15, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const second = makeRun('2026-01-16', 15, () => ({ normal: true }));
    const summary = buildChangeSummary({
      checkIns: [...first, ...second],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      treatments: [],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-30',
    });
    const sleep = summary.lines.find((l) => l.label === 'Sleep');
    expect(sleep?.bucket).toBe('improved');
  });

  it('marks a measure "changed" when notable days rise in the later half', () => {
    const first = makeRun('2026-01-01', 15, () => ({ normal: true }));
    const second = makeRun('2026-01-16', 15, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const summary = buildChangeSummary({
      checkIns: [...first, ...second],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      treatments: [],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-30',
    });
    const sleep = summary.lines.find((l) => l.label === 'Sleep');
    expect(['changed', 'new']).toContain(sleep?.bucket);
  });

  it('caveat and every line pass the health-language safety filter (no causal claims)', () => {
    const first = makeRun('2026-01-01', 15, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const second = makeRun('2026-01-16', 15, () => ({ normal: true }));
    const summary = buildChangeSummary({
      checkIns: [...first, ...second],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      treatments: [{ id: 't', category: 'hrt', title: 'HRT', date: '2026-01-14' }],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-01-30',
    });
    expect(findUnsafeLanguage(summary.caveat)).toEqual([]);
    for (const l of summary.lines) expect(findUnsafeLanguage(l.text)).toEqual([]);
    // Treatment context is listed but never causally linked.
    expect(summary.treatmentContext.some((t) => t.includes('HRT'))).toBe(true);
  });
});
