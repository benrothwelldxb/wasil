import { describe, expect, it } from 'vitest';
import { createRng, toBase36Id, xmur3 } from './rng';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    const seqA = Array.from({ length: 20 }, () => a.rand());
    const seqB = Array.from({ length: 20 }, () => b.rand());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-b');
    expect(a.rand()).not.toEqual(b.rand());
  });

  it('rand stays within [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const n = rng.rand();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('randInt is inclusive and within bounds', () => {
    const rng = createRng('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = rng.randInt(3, 7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      seen.add(n);
    }
    expect(seen.has(3)).toBe(true);
    expect(seen.has(7)).toBe(true);
  });

  it('weighted respects relative weights', () => {
    const rng = createRng('weights');
    let heavy = 0;
    for (let i = 0; i < 2000; i++) {
      if (rng.weighted([['H', 9], ['L', 1]] as const) === 'H') heavy++;
    }
    expect(heavy).toBeGreaterThan(1500); // ~90%
  });

  it('jitter stays within the requested band', () => {
    const rng = createRng('jitter');
    for (let i = 0; i < 500; i++) {
      const v = rng.jitter(100, 0.1);
      expect(v).toBeGreaterThanOrEqual(90);
      expect(v).toBeLessThanOrEqual(110);
    }
  });

  it('xmur3 and toBase36Id are stable', () => {
    expect(xmur3('abc')()).toEqual(xmur3('abc')());
    expect(toBase36Id('journey-1')).toEqual(toBase36Id('journey-1'));
    expect(toBase36Id('journey-1')).not.toEqual(toBase36Id('journey-2'));
    expect(toBase36Id('x')).toMatch(/^[0-9a-z]+$/);
  });
});
