import { describe, expect, it } from 'vitest';
import { STOPOVER_HUBS } from '@/data/datasets/cities';
import { getLivability, monthOf, weatherForMonth } from './livability';

describe('monthOf', () => {
  it('extracts the calendar month from a YYYY-MM-DD date', () => {
    expect(monthOf('2026-01-15')).toBe(1);
    expect(monthOf('2026-07-04')).toBe(7);
    expect(monthOf('2026-12-25')).toBe(12);
  });
});

describe('getLivability — curated cities', () => {
  it('returns curated, valid-range metrics for every stopover hub', () => {
    for (const city of STOPOVER_HUBS) {
      const l = getLivability(city.iata, city.appealScore);
      expect(l.walkingScore).toBeGreaterThanOrEqual(0);
      expect(l.walkingScore).toBeLessThanOrEqual(100);
      expect(l.safetyScore).toBeGreaterThanOrEqual(0);
      expect(l.safetyScore).toBeLessThanOrEqual(100);
      expect(l.neighbourhoodRating).toBeGreaterThanOrEqual(0);
      expect(l.neighbourhoodRating).toBeLessThanOrEqual(5);
    }
  });

  it('is a pure function of its inputs (same city → identical result)', () => {
    const a = getLivability('IST', 92);
    const b = getLivability('IST', 92);
    expect(a).toEqual(b);
  });
});

describe('getLivability — fallback for uncurated cities', () => {
  it('derives a deterministic, in-range estimate from appealScore alone', () => {
    const low = getLivability('ZZZ', 10);
    const high = getLivability('ZZZ', 95);
    expect(low.walkingScore).toBeGreaterThanOrEqual(0);
    expect(low.walkingScore).toBeLessThanOrEqual(100);
    expect(high.walkingScore).toBeGreaterThanOrEqual(0);
    expect(high.walkingScore).toBeLessThanOrEqual(100);
    // A higher appeal score should never yield a worse estimate.
    expect(high.walkingScore).toBeGreaterThan(low.walkingScore);
    expect(high.safetyScore).toBeGreaterThan(low.safetyScore);
    expect(high.neighbourhoodRating).toBeGreaterThan(low.neighbourhoodRating);
  });

  it('is deterministic for repeated calls with the same inputs', () => {
    expect(getLivability('QQQ', 50)).toEqual(getLivability('QQQ', 50));
  });
});

describe('weatherForMonth', () => {
  it('produces a plausible, in-range WeatherSummary for a curated climate profile', () => {
    const l = getLivability('KEF', 86);
    const w = weatherForMonth(l.climate, 7);
    expect(w.averageHighC).toBeGreaterThan(w.averageLowC - 0.01);
    expect(w.precipitationChance).toBeGreaterThanOrEqual(0);
    expect(w.precipitationChance).toBeLessThanOrEqual(1);
    expect(['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'snowy']).toContain(w.condition);
  });

  it('differs between a summer and a winter month for a seasonal city (Reykjavik)', () => {
    const l = getLivability('KEF', 86);
    const summer = weatherForMonth(l.climate, 7);
    const winter = weatherForMonth(l.climate, 1);
    expect(summer.averageHighC).toBeGreaterThan(winter.averageHighC);
    expect(summer.averageLowC).toBeGreaterThan(winter.averageLowC);
  });

  it('is deterministic for a given city and month', () => {
    const l = getLivability('IST', 92);
    const a = weatherForMonth(l.climate, 3);
    const b = weatherForMonth(l.climate, 3);
    expect(a).toEqual(b);
  });

  it('handles a southern-hemisphere seasonal inversion (Sydney: January warmer than July)', () => {
    const l = getLivability('SYD', 89);
    const january = weatherForMonth(l.climate, 1);
    const july = weatherForMonth(l.climate, 7);
    expect(january.averageHighC).toBeGreaterThan(july.averageHighC);
  });
});
