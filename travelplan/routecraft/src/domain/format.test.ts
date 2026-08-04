import { describe, expect, it } from 'vitest';
import {
  formatDateShort,
  formatDuration,
  formatMoney,
  formatPercent,
  formatSpan,
  formatTime,
} from './format';

describe('formatMoney', () => {
  it('formats USD without cents by default and with cents when precise', () => {
    expect(formatMoney({ amount: 1500, currency: 'USD' })).toBe('$1,500');
    expect(formatMoney({ amount: 1500.5, currency: 'USD' }, true)).toBe('$1,500.50');
  });
});

describe('formatDuration', () => {
  it('renders hours and minutes', () => {
    expect(formatDuration(615)).toBe('10h 15m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('formatSpan', () => {
  it('adds day granularity for long spans', () => {
    expect(formatSpan(60 * 24 + 8 * 60)).toBe('1d 8h');
    expect(formatSpan(60 * 24)).toBe('1d');
    expect(formatSpan(90)).toBe('1h 30m');
  });
});

describe('formatTime / formatDateShort', () => {
  it('formats ISO instants in UTC', () => {
    expect(formatTime('2026-09-15T09:05:00Z')).toBe('09:05');
    expect(formatTime('not-a-date')).toBe('--:--');
    // en-GB abbreviates September as "Sep" or "Sept" depending on ICU version.
    expect(formatDateShort('2026-09-15T00:00:00Z')).toMatch(/^15 Sept?$/);
  });
});

describe('formatPercent', () => {
  it('rounds a fraction to a whole percent', () => {
    expect(formatPercent(0.256)).toBe('26%');
    expect(formatPercent(0)).toBe('0%');
  });
});
