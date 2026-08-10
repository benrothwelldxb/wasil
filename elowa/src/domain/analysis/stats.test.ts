import { describe, it, expect } from 'vitest';
import { clamp, mean, median, round1, stdDev, lastN } from './stats';

describe('stats', () => {
  it('clamps to range', () => {
    expect(clamp(5, 0, 4)).toBe(4);
    expect(clamp(-1, 0, 4)).toBe(0);
    expect(clamp(2, 0, 4)).toBe(2);
  });

  it('computes mean', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });

  it('computes median (odd and even)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('computes population standard deviation', () => {
    expect(stdDev([2, 2, 2])).toBe(0);
    expect(round1(stdDev([1, 3]))).toBe(1);
  });

  it('rounds to one decimal', () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
  });

  it('takes last N', () => {
    expect(lastN([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(lastN([1], 5)).toEqual([1]);
  });
});
