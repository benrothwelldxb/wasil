import { describe, it, expect } from 'vitest';
import { normalizeWeights, DEFAULT_JOURNEY_SCORE_WEIGHTS, JOURNEY_SCORE_FACTORS } from './index';
import type { JourneyScoreFactorKey } from './types';

describe('normalizeWeights', () => {
  // ———— Defaults ————
  it('DEFAULT_JOURNEY_SCORE_WEIGHTS sums to 1 with epsilon tolerance', () => {
    const sum = Object.values(DEFAULT_JOURNEY_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('DEFAULT_JOURNEY_SCORE_WEIGHTS has all 12 keys', () => {
    for (const key of JOURNEY_SCORE_FACTORS) {
      expect(DEFAULT_JOURNEY_SCORE_WEIGHTS).toHaveProperty(key);
      expect(DEFAULT_JOURNEY_SCORE_WEIGHTS[key as JourneyScoreFactorKey]).toBeGreaterThanOrEqual(0);
    }
  });

  // ———— Sum-to-1 invariant ————
  it('uniform importances (all 1) yields weights summing to 1', () => {
    const raw = JOURNEY_SCORE_FACTORS.reduce(
      (acc, k) => ({ ...acc, [k]: 1 }),
      {} as Partial<Record<JourneyScoreFactorKey, number>>
    );
    const result = normalizeWeights(raw);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('skewed importances (one factor=10, others=1) yields weights summing to 1', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 10,
      cabinQuality: 1,
      hotelQuality: 1,
      weather: 1,
      transfers: 1,
      duration: 1,
      jetLag: 1,
      airportQuality: 1,
      touristAppeal: 1,
      neighbourhoodQuality: 1,
      foodRating: 1,
      safety: 1,
    };
    const result = normalizeWeights(raw);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('one non-zero importance (only cost=5) yields weights summing to 1', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = { cost: 5 };
    const result = normalizeWeights(raw);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  // ———— Clamping negatives ————
  it('negative importances are clamped to 0', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: -5,
      cabinQuality: 10,
      hotelQuality: -2,
    };
    const result = normalizeWeights(raw);
    // cost and hotelQuality should have weight 0
    expect(result.cost).toBeCloseTo(0, 9);
    expect(result.hotelQuality).toBeCloseTo(0, 9);
    // cabinQuality should have all the weight
    expect(result.cabinQuality).toBeCloseTo(1, 9);
  });

  it('mixed positive and negative importances: negatives contribute nothing', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 5,
      cabinQuality: -10, // negative → clamped to 0
      hotelQuality: 5,
    };
    const result = normalizeWeights(raw);
    // cost and hotelQuality each get 0.5
    expect(result.cost).toBeCloseTo(0.5, 9);
    expect(result.hotelQuality).toBeCloseTo(0.5, 9);
    expect(result.cabinQuality).toBeCloseTo(0, 9);
  });

  // ———— Missing keys ————
  it('missing keys are treated as 0', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 10,
      // all other keys missing
    };
    const result = normalizeWeights(raw);
    expect(result.cost).toBeCloseTo(1, 9);
    for (const key of JOURNEY_SCORE_FACTORS) {
      if (key !== 'cost') {
        expect(result[key as JourneyScoreFactorKey]).toBeCloseTo(0, 9);
      }
    }
  });

  // ———— All-zero fallback ————
  it('all-zero importances returns DEFAULT_JOURNEY_SCORE_WEIGHTS', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 0,
      cabinQuality: 0,
      hotelQuality: 0,
      weather: 0,
      transfers: 0,
      duration: 0,
      jetLag: 0,
      airportQuality: 0,
      touristAppeal: 0,
      neighbourhoodQuality: 0,
      foodRating: 0,
      safety: 0,
    };
    const result = normalizeWeights(raw);
    expect(result).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);
  });

  it('empty object returns DEFAULT_JOURNEY_SCORE_WEIGHTS', () => {
    const result = normalizeWeights({});
    expect(result).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);
  });

  // ———— Proportional distribution ————
  it('importances are normalized proportionally', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 2,
      cabinQuality: 3,
      hotelQuality: 5,
    };
    const result = normalizeWeights(raw);
    // total = 2 + 3 + 5 = 10
    expect(result.cost).toBeCloseTo(0.2, 9); // 2/10
    expect(result.cabinQuality).toBeCloseTo(0.3, 9); // 3/10
    expect(result.hotelQuality).toBeCloseTo(0.5, 9); // 5/10
  });

  // ———— Finite number validation ————
  it('NaN and Infinity importances are clamped to 0', () => {
    const raw: Record<JourneyScoreFactorKey, number> = {
      cost: NaN,
      cabinQuality: Infinity,
      hotelQuality: -Infinity,
      weather: 10,
      transfers: 5,
      duration: 0,
      jetLag: 0,
      airportQuality: 0,
      touristAppeal: 0,
      neighbourhoodQuality: 0,
      foodRating: 0,
      safety: 0,
    };
    const result = normalizeWeights(raw);
    // Only weather and transfers are non-zero
    expect(result.cost).toBeCloseTo(0, 9);
    expect(result.cabinQuality).toBeCloseTo(0, 9);
    expect(result.hotelQuality).toBeCloseTo(0, 9);
    expect(result.weather).toBeCloseTo(10 / 15, 9);
    expect(result.transfers).toBeCloseTo(5 / 15, 9);
  });

  // ———— Very large values ————
  it('very large importance values are handled correctly', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 1e10,
      cabinQuality: 1e10,
    };
    const result = normalizeWeights(raw);
    expect(result.cost).toBeCloseTo(0.5, 9);
    expect(result.cabinQuality).toBeCloseTo(0.5, 9);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });

  // ———— All factors present ————
  it('assigns positive weights to all provided importances', () => {
    const raw: Record<JourneyScoreFactorKey, number> = {
      cost: 1,
      cabinQuality: 1,
      hotelQuality: 1,
      weather: 1,
      transfers: 1,
      duration: 1,
      jetLag: 1,
      airportQuality: 1,
      touristAppeal: 1,
      neighbourhoodQuality: 1,
      foodRating: 1,
      safety: 1,
    };
    const result = normalizeWeights(raw);
    for (const key of JOURNEY_SCORE_FACTORS) {
      expect(result[key as JourneyScoreFactorKey]).toBeCloseTo(1 / 12, 9);
    }
  });

  // ———— Determinism ————
  it('determinism: same input yields identical output', () => {
    const raw: Partial<Record<JourneyScoreFactorKey, number>> = {
      cost: 5,
      hotelQuality: 3,
      weather: 2,
    };
    const result1 = normalizeWeights(raw);
    const result2 = normalizeWeights(raw);
    expect(result1).toEqual(result2);
  });
});
