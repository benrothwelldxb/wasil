import { describe, expect, it } from 'vitest';
import { clamp, clamp01, mean } from './math';

describe('clamp', () => {
  it('passes through values already within the default [0, 100] range', () => {
    expect(clamp(50)).toBe(50);
    expect(clamp(0)).toBe(0);
    expect(clamp(100)).toBe(100);
  });

  it('clamps above the default max down to 100', () => {
    expect(clamp(150)).toBe(100);
  });

  it('clamps below the default min up to 0', () => {
    expect(clamp(-10)).toBe(0);
  });

  it('honours explicit min/max bounds', () => {
    expect(clamp(9, 1, 5)).toBe(5);
    expect(clamp(-9, 1, 5)).toBe(1);
    expect(clamp(3, 1, 5)).toBe(3);
  });

  it('supports non-0-100 ranges such as star ratings (1–5)', () => {
    expect(clamp(7, 1, 5)).toBe(5);
    expect(clamp(0, 1, 5)).toBe(1);
  });
});

describe('clamp01', () => {
  it('clamps into [0, 1]', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });
});

describe('mean', () => {
  it('returns null for an empty array', () => {
    expect(mean([])).toBeNull();
  });

  it('returns the arithmetic mean for non-empty arrays', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([10])).toBe(10);
    expect(mean([0, 100])).toBe(50);
  });
});
