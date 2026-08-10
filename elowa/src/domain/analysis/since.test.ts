import { describe, it, expect } from 'vitest';
import { buildSinceComparison } from './since';
import { findUnsafeLanguage } from '@/domain/safety/language';
import { makeRun } from '@/test/factories';

const SLEEP = 'sym_sleep';
const labelOf = () => 'Sleep';

describe('buildSinceComparison', () => {
  it('detects fewer worse days after an anchor', () => {
    const before = makeRun('2026-01-01', 10, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const after = makeRun('2026-01-11', 10, () => ({ normal: true }));
    const cmp = buildSinceComparison({
      checkIns: [...before, ...after],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      anchorDate: '2026-01-11',
      anchorLabel: 'HRT',
    });
    const sleepChange = cmp.changes.find((c) => c.key === SLEEP);
    expect(sleepChange?.direction).toBe('less');
    expect(cmp.dataQuality).toBe('good');
    expect(cmp.caveat.toLowerCase()).toContain('cannot determine');
    // The caveat must itself pass the health-language safety filter.
    expect(findUnsafeLanguage(cmp.caveat)).toEqual([]);
    for (const c of cmp.changes) expect(findUnsafeLanguage(c.description)).toEqual([]);
  });

  it('flags limited data quality with short windows', () => {
    const before = makeRun('2026-01-01', 3, () => ({ obs: [{ id: SLEEP, status: 'much_worse' as const }] }));
    const after = makeRun('2026-01-04', 3, () => ({ normal: true }));
    const cmp = buildSinceComparison({
      checkIns: [...before, ...after],
      symptomIds: [SLEEP],
      pinnedIds: [SLEEP],
      labelOf,
      anchorDate: '2026-01-04',
      anchorLabel: 'X',
    });
    expect(cmp.dataQuality).toBe('limited');
  });
});
