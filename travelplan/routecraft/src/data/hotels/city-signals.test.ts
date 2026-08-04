import { describe, expect, it } from 'vitest';
import { getCitySignals, getCityWeather } from './city-signals';

describe('getCitySignals', () => {
  it('returns in-range generic signals for a curated city', () => {
    const signals = getCitySignals('IST', 90);
    expect(signals.safety).toBeGreaterThanOrEqual(0);
    expect(signals.safety).toBeLessThanOrEqual(100);
    expect(signals.neighbourhoodQuality).toBeGreaterThanOrEqual(0);
    expect(signals.neighbourhoodQuality).toBeLessThanOrEqual(100);
    expect(signals.weather).toBeGreaterThanOrEqual(0);
    expect(signals.weather).toBeLessThanOrEqual(100);
  });
});

describe('getCityWeather', () => {
  it('returns a valid WeatherSummary for a known city', () => {
    const weather = getCityWeather('DXB');
    expect(weather).toBeDefined();
    expect(['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'snowy']).toContain(weather?.condition);
    expect(weather?.averageHighC).toBeGreaterThanOrEqual(weather?.averageLowC ?? 0);
    expect(weather?.precipitationChance).toBeGreaterThanOrEqual(0);
    expect(weather?.precipitationChance).toBeLessThanOrEqual(1);
  });

  it('returns undefined for an unknown city', () => {
    expect(getCityWeather('ZZZ')).toBeUndefined();
    expect(getCityWeather('XXX', 3)).toBeUndefined();
  });

  it('is deterministic for the same (iata, month)', () => {
    const a = getCityWeather('IST', 5);
    const b = getCityWeather('IST', 5);
    expect(a).toEqual(b);
  });

  it('varies with the requested month for a seasonal city', () => {
    const summer = getCityWeather('KEF', 6); // July (0-indexed)
    const winter = getCityWeather('KEF', 0); // January (0-indexed)
    expect(summer?.averageHighC).toBeGreaterThan(winter?.averageHighC ?? Infinity);
  });

  it('defaults to a representative month when none is given', () => {
    const defaulted = getCityWeather('AMS');
    const june = getCityWeather('AMS', 5); // June (0-indexed)
    expect(defaulted).toEqual(june);
  });

  it('accepts 0-indexed months (JS Date convention) across the full year', () => {
    for (let month = 0; month < 12; month += 1) {
      const weather = getCityWeather('SIN', month);
      expect(weather).toBeDefined();
    }
  });
});
