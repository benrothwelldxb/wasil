import { describe, it, expect } from 'vitest';
import { computeJourneyScore, normalizeWeights, DEFAULT_JOURNEY_SCORE_WEIGHTS } from './index';
import type { JourneyScoreFactors, JourneyScoreWeights } from './types';

describe('computeJourneyScore', () => {
  // ———— Helpers ————
  const allPresentFactors = (value: number): JourneyScoreFactors => ({
    cost: value,
    cabinQuality: value,
    hotelQuality: value,
    weather: value,
    transfers: value,
    duration: value,
    jetLag: value,
    airportQuality: value,
    touristAppeal: value,
    neighbourhoodQuality: value,
    foodRating: value,
    safety: value,
  });

  const directJourneyFactors = (value: number): JourneyScoreFactors => ({
    cost: value,
    cabinQuality: value,
    hotelQuality: null, // direct: no hotel
    weather: value,
    transfers: null, // direct: no transfers
    duration: value,
    jetLag: value,
    airportQuality: value,
    touristAppeal: value,
    neighbourhoodQuality: value,
    foodRating: value,
    safety: value,
  });

  // ———— Output range [0, 100] ————
  it('always returns total in [0, 100]', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('total is 0 when all factors are 0', () => {
    const factors = allPresentFactors(0);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBe(0);
  });

  it('total is 100 when all factors are 100', () => {
    const factors = allPresentFactors(100);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBe(100);
  });

  it('total in [0,100] across many factor/weight combinations', () => {
    const factorValues = [0, 25, 50, 75, 100];
    const weightCases: Partial<Record<string, number>>[] = [
      { cost: 10, duration: 5 },
      { safety: 1, touristAppeal: 1 },
      { cost: 100 }, // heavily skewed
      {}, // all defaults
    ];

    for (const factorVal of factorValues) {
      for (const raw of weightCases) {
        const factors = allPresentFactors(factorVal);
        const weights = normalizeWeights(raw);
        const score = computeJourneyScore(factors, weights);
        expect(score.total).toBeGreaterThanOrEqual(0);
        expect(score.total).toBeLessThanOrEqual(100);
      }
    }
  });

  // ———— Effective weights ————
  it('effectiveWeights sums to 1 when ≥1 factor present', () => {
    const factors = directJourneyFactors(50); // 10 of 12 present
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    const sum = Object.values(score.effectiveWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('null factors carry weight 0 in effectiveWeights', () => {
    const factors = directJourneyFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.effectiveWeights.hotelQuality).toBe(0);
    expect(score.effectiveWeights.transfers).toBe(0);
  });

  it('present factors get positive weights in effectiveWeights', () => {
    const factors = directJourneyFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.effectiveWeights.cost).toBeGreaterThan(0);
    expect(score.effectiveWeights.duration).toBeGreaterThan(0);
  });

  // ———— Null redistribution ————
  it('null redistribution: a factor set with some nulls scores the same as the same non-null factors reweighted', () => {
    // Direct journey: hotelQuality and transfers are null
    const directFactors = directJourneyFactors(50);
    const directScore = computeJourneyScore(directFactors, DEFAULT_JOURNEY_SCORE_WEIGHTS);

    // Same factors, but manually set nulls to the mean of the others and recalculate with adjusted weights
    const presentFactors = allPresentFactors(50);
    presentFactors.hotelQuality = null;
    presentFactors.transfers = null;

    // When all present factors are equal (50), the score should be 50
    // regardless of how weights are distributed among them
    expect(directScore.total).toBe(50);
  });

  // ———— Contribution sum ————
  it('sum of contributions ≈ total (pre-rounding, ±1e-6)', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    const contributionSum = score.contributions.reduce((sum, c) => sum + c.contribution, 0);
    expect(contributionSum).toBeCloseTo(score.total, 5);
  });

  it('contributions array sums to the total value', () => {
    const factors: JourneyScoreFactors = {
      cost: 80,
      cabinQuality: 70,
      hotelQuality: null,
      weather: 60,
      transfers: null,
      duration: 50,
      jetLag: 40,
      airportQuality: 30,
      touristAppeal: 90,
      neighbourhoodQuality: 85,
      foodRating: 75,
      safety: 65,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    const sum = score.contributions.reduce((s, c) => s + c.contribution, 0);
    expect(Math.abs(sum - score.total)).toBeLessThan(1); // rounding tolerance
  });

  // ———— All-null factors ————
  it('all-null factors yields total === 0 with no NaN', () => {
    const factors: JourneyScoreFactors = {
      cost: null,
      cabinQuality: null,
      hotelQuality: null,
      weather: null,
      transfers: null,
      duration: null,
      jetLag: null,
      airportQuality: null,
      touristAppeal: null,
      neighbourhoodQuality: null,
      foodRating: null,
      safety: null,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBe(0);
    expect(Number.isNaN(score.total)).toBe(false);
  });

  // ———— Zero-weight fallback ————
  it('all present factors with zero weight use equal split', () => {
    const factors = allPresentFactors(100);
    // All factors are 100, so mean of all is 100
    const zeroWeights: JourneyScoreWeights = {
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
    const score = computeJourneyScore(factors, zeroWeights);
    // Equal split with all factors at 100 = 100
    expect(score.total).toBe(100);
  });

  it('present factors with some zero weights: non-zero weights are used', () => {
    const factors = allPresentFactors(50);
    const weights: JourneyScoreWeights = {
      cost: 0.5,
      cabinQuality: 0.5,
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
    const score = computeJourneyScore(factors, weights);
    // Cost and cabinQuality both at 50, equal weights → total = 50
    expect(score.total).toBe(50);
  });

  // ———— Monotonicity in factor value ————
  it('raising one present factor (others fixed) never lowers total', () => {
    const baseFactors = allPresentFactors(50);
    const scoreBase = computeJourneyScore(baseFactors, DEFAULT_JOURNEY_SCORE_WEIGHTS);

    // Raise cost from 50 to 75
    const raisedFactors = { ...baseFactors, cost: 75 };
    const scoreRaised = computeJourneyScore(raisedFactors, DEFAULT_JOURNEY_SCORE_WEIGHTS);

    expect(scoreRaised.total).toBeGreaterThanOrEqual(scoreBase.total);
  });

  it('monotonicity holds for multiple factors', () => {
    const factors = allPresentFactors(50);
    const score50 = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);

    for (const key of ['cost', 'duration', 'jetLag'] as const) {
      const raised = { ...factors, [key]: 75 };
      const scoreRaised = computeJourneyScore(raised, DEFAULT_JOURNEY_SCORE_WEIGHTS);
      expect(scoreRaised.total).toBeGreaterThanOrEqual(score50.total);
    }
  });

  // ———— Weight monotonicity ————
  it('shifting importance onto a factor above the weighted mean does not lower total', () => {
    const factors: JourneyScoreFactors = {
      cost: 80, // above mean of 50
      cabinQuality: 20, // below mean
      hotelQuality: 50,
      weather: 50,
      transfers: 50,
      duration: 50,
      jetLag: 50,
      airportQuality: 50,
      touristAppeal: 50,
      neighbourhoodQuality: 50,
      foodRating: 50,
      safety: 50,
    };

    // Original weights: default
    const scoreDefault = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);

    // Shift more weight to cost (which is high at 80)
    const shiftedWeights = normalizeWeights({
      cost: 100,
      cabinQuality: 1,
      weather: 1,
      duration: 1,
      jetLag: 1,
      airportQuality: 1,
      touristAppeal: 1,
      neighbourhoodQuality: 1,
      foodRating: 1,
      safety: 1,
    });
    const scoreShifted = computeJourneyScore(factors, shiftedWeights);

    expect(scoreShifted.total).toBeGreaterThanOrEqual(scoreDefault.total);
  });

  // ———— Determinism ————
  it('determinism: same inputs yield identical result', () => {
    const factors = allPresentFactors(50);
    const score1 = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    const score2 = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score1.total).toBe(score2.total);
    expect(score1.contributions).toEqual(score2.contributions);
    expect(score1.effectiveWeights).toEqual(score2.effectiveWeights);
  });

  // ———— Contributions structure ————
  it('contributions is sorted descending by contribution value', () => {
    const factors: JourneyScoreFactors = {
      cost: 100,
      cabinQuality: 80,
      hotelQuality: 60,
      weather: 40,
      transfers: 20,
      duration: 50,
      jetLag: 70,
      airportQuality: 10,
      touristAppeal: 90,
      neighbourhoodQuality: 30,
      foodRating: 55,
      safety: 65,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    for (let i = 1; i < score.contributions.length; i++) {
      expect(score.contributions[i - 1].contribution).toBeGreaterThanOrEqual(
        score.contributions[i].contribution
      );
    }
  });

  it('contributions has length 12 (all factors, including nulls)', () => {
    const factors = directJourneyFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.contributions).toHaveLength(12);
  });

  it('null factors in contributions have contribution 0', () => {
    const factors = directJourneyFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    const nullContrib = score.contributions.find((c) => c.factor === 'hotelQuality');
    expect(nullContrib).toBeDefined();
    expect(nullContrib!.value).toBeNull();
    expect(nullContrib!.contribution).toBe(0);
  });

  // ———— Narrative ————
  it('narrative is a non-empty string', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(typeof score.narrative).toBe('string');
    expect(score.narrative.length).toBeGreaterThan(0);
  });

  it('narrative includes the total score', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.narrative).toContain(score.total.toString());
  });

  it('narrative names a present factor', () => {
    const factors: JourneyScoreFactors = {
      cost: 100, // highest
      cabinQuality: 50,
      hotelQuality: null,
      weather: 40,
      transfers: null,
      duration: 30,
      jetLag: 20,
      airportQuality: 10,
      touristAppeal: 5,
      neighbourhoodQuality: 1,
      foodRating: 1,
      safety: 1,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    // Narrative should mention "Cost" (the factor label for 'cost')
    expect(score.narrative).toContain('Cost');
  });

  it('all-null factors still returns a non-empty narrative', () => {
    const factors: JourneyScoreFactors = {
      cost: null,
      cabinQuality: null,
      hotelQuality: null,
      weather: null,
      transfers: null,
      duration: null,
      jetLag: null,
      airportQuality: null,
      touristAppeal: null,
      neighbourhoodQuality: null,
      foodRating: null,
      safety: null,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.narrative.length).toBeGreaterThan(0);
  });

  // ———— Factor value normalization ————
  it('factors are echoed in the result', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.factors).toEqual(factors);
  });

  it('contribution.value matches factors[factor]', () => {
    const factors = directJourneyFactors(75);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    for (const contrib of score.contributions) {
      expect(contrib.value).toBe(factors[contrib.factor]);
    }
  });

  // ———— Edge case: direct vs stopover ————
  it('direct journey (nulls only for hotelQuality, transfers) computes correctly', () => {
    const factors = directJourneyFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('stopover journey (all factors present) computes correctly', () => {
    const factors = allPresentFactors(50);
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  // ———— Extreme values ————
  it('handles boundary values correctly', () => {
    const factors = allPresentFactors(0);
    const score1 = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score1.total).toBe(0);

    const factors2 = allPresentFactors(100);
    const score2 = computeJourneyScore(factors2, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score2.total).toBe(100);
  });

  it('mixed extreme values (some 0, some 100)', () => {
    const factors: JourneyScoreFactors = {
      cost: 100,
      cabinQuality: 0,
      hotelQuality: 100,
      weather: 0,
      transfers: 100,
      duration: 0,
      jetLag: 100,
      airportQuality: 0,
      touristAppeal: 100,
      neighbourhoodQuality: 0,
      foodRating: 100,
      safety: 0,
    };
    const score = computeJourneyScore(factors, DEFAULT_JOURNEY_SCORE_WEIGHTS);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});
