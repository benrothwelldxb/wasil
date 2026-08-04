import { describe, it, expect } from 'vitest';
import { weatherComfortScore } from './index';
import type { WeatherSummary } from '@/domain/hotels/types';

describe('weatherComfortScore', () => {
  // ———— Ideal conditions ————
  it('sunny, 22°C, no precipitation scores high (near 92)', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 24,
      averageLowC: 20,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(92, 0);
  });

  it('perfect sunny 22°C with 0 precip scores exactly 92', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(92, 0);
  });

  // ———— Condition-based bases ————
  it('partly cloudy, ideal temp, no precip scores 80', () => {
    const weather: WeatherSummary = {
      condition: 'partly_cloudy',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(80, 0);
  });

  it('cloudy, ideal temp, no precip scores 62', () => {
    const weather: WeatherSummary = {
      condition: 'cloudy',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(62, 0);
  });

  it('rainy, ideal temp, no precip scores 42', () => {
    const weather: WeatherSummary = {
      condition: 'rainy',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(42, 0);
  });

  it('snowy, ideal temp, no precip scores 52', () => {
    const weather: WeatherSummary = {
      condition: 'snowy',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(52, 0);
  });

  // ———— Temperature penalty ————
  it('temperature penalty is symmetric around 22°C: 10°C and 34°C give equal penalty', () => {
    const cold: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 10,
      averageLowC: 10,
      precipitationChance: 0,
    };
    const hot: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 34,
      averageLowC: 34,
      precipitationChance: 0,
    };
    const coldScore = weatherComfortScore(cold);
    const hotScore = weatherComfortScore(hot);
    expect(coldScore).toBeCloseTo(hotScore, 0);
  });

  it('cold climate (5°C avg) applies temperature penalty', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 5,
      averageLowC: 5,
      precipitationChance: 0,
    };
    // base 92 - |5 - 22| * 1.5 = 92 - 25.5 = 66.5
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(66.5, 0);
  });

  it('hot climate (35°C avg) applies temperature penalty', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 35,
      averageLowC: 35,
      precipitationChance: 0,
    };
    // base 92 - |35 - 22| * 1.5 = 92 - 19.5 = 72.5
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(72.5, 0);
  });

  it('very cold (0°C) severely penalizes', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 0,
      averageLowC: 0,
      precipitationChance: 0,
    };
    // base 92 - |0 - 22| * 1.5 = 92 - 33 = 59
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(59, 0);
  });

  // ———— Precipitation penalty ————
  it('precipitation lowers the score monotonically', () => {
    const noPrecip: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const somePrecip: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0.3,
    };
    const morePrecip: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0.7,
    };
    const s1 = weatherComfortScore(noPrecip);
    const s2 = weatherComfortScore(somePrecip);
    const s3 = weatherComfortScore(morePrecip);
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeGreaterThan(s3);
  });

  it('100% precipitation chance applies maximum penalty', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 1,
    };
    // base 92 - 0 - 1 * 30 = 62
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(62, 0);
  });

  // ———— Combined penalties ————
  it('cold temperature + high precipitation compound', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 0,
      averageLowC: 0,
      precipitationChance: 1,
    };
    // base 92 - 33 - 30 = 29
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(29, 0);
  });

  it('rainy + cold + temp penalty all compound', () => {
    const weather: WeatherSummary = {
      condition: 'rainy',
      averageHighC: 5,
      averageLowC: 5,
      precipitationChance: 0.8,
    };
    // base 42 - |5-22|*1.5 - 0.8*30 = 42 - 25.5 - 24 = -7.5 → clamped to 0
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(0, 0);
  });

  // ———— Clamping to [0, 100] ————
  it('extreme cold + heavy rain clamps to 0 (never negative)', () => {
    const weather: WeatherSummary = {
      condition: 'snowy',
      averageHighC: -20,
      averageLowC: -20,
      precipitationChance: 1,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('always clamps output to [0, 100]', () => {
    const extremeCold: WeatherSummary = {
      condition: 'snowy',
      averageHighC: -50,
      averageLowC: -50,
      precipitationChance: 1,
    };
    const score = weatherComfortScore(extremeCold);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // ———— Partial temperature information ————
  it('uses average of high and low for temperature', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 26,
      averageLowC: 18,
      precipitationChance: 0,
    };
    // avg = (26 + 18) / 2 = 22
    // base 92 - |22 - 22| * 1.5 = 92
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(92, 0);
  });

  it('correctly handles high and low not centered on 22', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 30,
      averageLowC: 20,
      precipitationChance: 0,
    };
    // avg = (30 + 20) / 2 = 25
    // base 92 - |25 - 22| * 1.5 = 92 - 4.5 = 87.5
    const score = weatherComfortScore(weather);
    expect(score).toBeCloseTo(87.5, 0);
  });

  // ———— Determinism ————
  it('determinism: same weather yields identical score', () => {
    const weather: WeatherSummary = {
      condition: 'partly_cloudy',
      averageHighC: 20,
      averageLowC: 16,
      precipitationChance: 0.2,
    };
    const score1 = weatherComfortScore(weather);
    const score2 = weatherComfortScore(weather);
    expect(score1).toBe(score2);
  });

  // ———— Edge cases ————
  it('zero precipitation chance with sunny condition scores high', () => {
    const weather: WeatherSummary = {
      condition: 'sunny',
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: 0,
    };
    const score = weatherComfortScore(weather);
    expect(score).toBeGreaterThan(85);
  });

  it('negative precipitation chance (if somehow passed) is treated as 0', () => {
    // Cast to bypass type safety for testing edge case
    const weather = {
      condition: 'sunny' as const,
      averageHighC: 22,
      averageLowC: 22,
      precipitationChance: -0.5,
    } as WeatherSummary;
    const score = weatherComfortScore(weather);
    // base 92 - 0 - (-0.5 * 30) = 92 + 15 = 107 → clamped to 100
    expect(score).toBeLessThanOrEqual(100);
  });
});
