import { describe, it, expect } from 'vitest';
import { generateDemoDataset } from './generateDemo';

describe('generateDemoDataset', () => {
  it('is deterministic for a given end date', () => {
    const a = generateDemoDataset('2026-06-01');
    const b = generateDemoDataset('2026-06-01');
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('produces the required narrative elements', () => {
    const data = generateDemoDataset('2026-06-01');
    expect(data.profile.displayName).toBe('Sarah');
    expect(data.pinnedSymptomIds.length).toBeGreaterThanOrEqual(3);
    expect(data.checkIns.length).toBeGreaterThan(40);
    // A treatment change (HRT) exists.
    expect(data.treatments.some((t) => t.category === 'hrt')).toBe(true);
    // Period days for changing cycle lengths.
    expect(data.periods.length).toBeGreaterThan(0);
    // Some notes were recorded.
    expect(data.checkIns.some((c) => c.note)).toBe(true);
    // Some detailed (worse) days and some normal days both exist.
    expect(data.checkIns.some((c) => c.kind === 'detailed')).toBe(true);
    expect(data.checkIns.some((c) => c.kind === 'normal')).toBe(true);
  });
});
