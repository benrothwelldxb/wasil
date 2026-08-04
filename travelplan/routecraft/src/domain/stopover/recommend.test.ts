import { describe, expect, it } from 'vitest';
import type { CandidateCity, DiscoveryRequest } from './types';
import { RECOMMEND_LIMIT } from './types';
import { HeuristicCandidateRecommender, heuristicRecommender, scoreCandidate } from './recommend';

// ——— fixtures ———
//
// A rough O(DXB) → D(LHR) routing. IST sits close to the great-circle path
// between them; SYD sits nowhere near it (a hard-gated far detour).

const DXB: CandidateCity = {
  iata: 'DXB',
  cityName: 'Dubai',
  countryCode: 'AE',
  lat: 25.2532,
  lon: 55.3657,
  hubStrength: 5,
  appealScore: 70,
  tags: ['shopping', 'nightlife'],
  hotelBaseNightly: { amount: 120, currency: 'USD' },
  headline: 'Origin',
  highlights: [],
};

const LHR: CandidateCity = {
  iata: 'LHR',
  cityName: 'London',
  countryCode: 'GB',
  lat: 51.4700,
  lon: -0.4543,
  hubStrength: 5,
  appealScore: 80,
  tags: ['culture'],
  hotelBaseNightly: { amount: 150, currency: 'USD' },
  headline: 'Destination',
  highlights: [],
};

const IST: CandidateCity = {
  iata: 'IST',
  cityName: 'Istanbul',
  countryCode: 'TR',
  lat: 41.2753,
  lon: 28.7519,
  hubStrength: 5,
  appealScore: 85,
  tags: ['culture', 'food'],
  hotelBaseNightly: { amount: 70, currency: 'USD' },
  headline: 'Istanbul stopover',
  highlights: ['Blue Mosque', 'Grand Bazaar'],
};

const SYD: CandidateCity = {
  iata: 'SYD',
  cityName: 'Sydney',
  countryCode: 'AU',
  lat: -33.8688,
  lon: 151.2093,
  hubStrength: 4,
  appealScore: 90,
  tags: ['nature', 'food'],
  hotelBaseNightly: { amount: 130, currency: 'USD' },
  headline: 'Sydney (way off-path)',
  highlights: ['Opera House'],
};

// Cheap luxury hotel base so a very high budget stays affordable at 1 night
// even for a pricey hub, used for the "expensive city" gating test.
const EXPENSIVE: CandidateCity = {
  iata: 'ZRH',
  cityName: 'Zurich',
  countryCode: 'CH',
  lat: 47.3769,
  lon: 8.5417,
  hubStrength: 4,
  appealScore: 60,
  tags: ['comfort'],
  hotelBaseNightly: { amount: 9000, currency: 'USD' },
  headline: 'Very expensive stopover',
  highlights: [],
};

const CITY_POOL: CandidateCity[] = [DXB, LHR, IST, SYD, EXPENSIVE];

function baseRequest(overrides: Partial<DiscoveryRequest> = {}): DiscoveryRequest {
  return {
    origin: 'DXB',
    destination: 'LHR',
    maxStopovers: 2,
    maxStopoverNights: 2,
    budget: { amount: 2500, currency: 'USD' },
    departureDate: '2026-09-15',
    pax: { adults: 1, children: 0 },
    cabin: 'economy',
    preferences: [],
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('gates out the origin and destination themselves', () => {
    const request = baseRequest();
    expect(scoreCandidate(request, DXB, CITY_POOL)).toBeNull();
    expect(scoreCandidate(request, LHR, CITY_POOL)).toBeNull();
  });

  it('scores an on-path city higher than a far-detour city', () => {
    const request = baseRequest();
    const near = scoreCandidate(request, IST, CITY_POOL);
    const far = scoreCandidate(request, SYD, CITY_POOL);

    expect(near).not.toBeNull();
    // SYD is gated out entirely by the detour hard gate.
    expect(far).toBeNull();
    expect(near!.score).toBeGreaterThan(0);
  });

  it('gates out a city that is unaffordable even at 1 night', () => {
    const request = baseRequest({ budget: { amount: 300, currency: 'USD' } });
    const result = scoreCandidate(request, EXPENSIVE, CITY_POOL);
    expect(result).toBeNull();
  });

  it('picks more nights when affordable, fewer when budget is tight', () => {
    const roomyRequest = baseRequest({
      maxStopoverNights: 3,
      budget: { amount: 5000, currency: 'USD' },
    });
    const roomy = scoreCandidate(roomyRequest, IST, CITY_POOL);
    expect(roomy).not.toBeNull();
    // nightsFactor peaks at n=2 (1.0), so with ample budget 2 nights should
    // beat both 1 (0.85) and 3 (0.95) on nightsValue.
    expect(roomy!.nights).toBe(2);

    // A tight budget that only affords 1 night (n=1 total ≈ 767, n=2 ≈ 837)
    // should still yield a result (not gate out) and fall back to n=1.
    const tightRequest = baseRequest({
      maxStopoverNights: 3,
      budget: { amount: 800, currency: 'USD' },
    });
    const tight = scoreCandidate(tightRequest, IST, CITY_POOL);
    expect(tight).not.toBeNull();
    expect(tight!.nights).toBe(1);
  });

  it('boosts the score of a city matching the traveller preferences', () => {
    const noPrefs = baseRequest({ preferences: [] });
    const withPrefs = baseRequest({ preferences: ['culture', 'food'] });

    const scoreNoPrefs = scoreCandidate(noPrefs, IST, CITY_POOL);
    const scoreWithPrefs = scoreCandidate(withPrefs, IST, CITY_POOL);

    expect(scoreNoPrefs).not.toBeNull();
    expect(scoreWithPrefs).not.toBeNull();
    expect(scoreWithPrefs!.score).toBeGreaterThan(scoreNoPrefs!.score);
  });

  it('produces a final score clamped to [0, 1]', () => {
    const request = baseRequest({ preferences: ['culture', 'food', 'nightlife'] });
    const result = scoreCandidate(request, IST, CITY_POOL);
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThanOrEqual(1);
    expect(result!.score).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for the same inputs', () => {
    const request = baseRequest();
    const a = scoreCandidate(request, IST, CITY_POOL);
    const b = scoreCandidate(request, IST, CITY_POOL);
    expect(a).toEqual(b);
  });
});

describe('HeuristicCandidateRecommender.recommend', () => {
  it('has the expected provenance id', () => {
    expect(heuristicRecommender.id).toBe('heuristic-v1');
  });

  it('excludes origin/destination and caps the shortlist at RECOMMEND_LIMIT', async () => {
    // Build a large pool of affordable, on-path, similarly-scored cities.
    const manyCities: CandidateCity[] = Array.from({ length: RECOMMEND_LIMIT + 10 }, (_, i) => ({
      iata: `C${String(i).padStart(2, '0')}`,
      cityName: `City ${i}`,
      countryCode: 'XX',
      // Spread along the great-circle path between DXB and LHR.
      lat: DXB.lat + ((LHR.lat - DXB.lat) * (i + 1)) / (RECOMMEND_LIMIT + 11),
      lon: DXB.lon + ((LHR.lon - DXB.lon) * (i + 1)) / (RECOMMEND_LIMIT + 11),
      hubStrength: 3,
      appealScore: 60,
      tags: [],
      hotelBaseNightly: { amount: 80, currency: 'USD' },
      headline: `Headline ${i}`,
      highlights: [],
    }));
    const pool = [DXB, LHR, ...manyCities];
    const request = baseRequest();

    const recs = await heuristicRecommender.recommend(request, pool);

    expect(recs.length).toBeLessThanOrEqual(RECOMMEND_LIMIT);
    for (const rec of recs) {
      expect(rec.city.iata).not.toBe('DXB');
      expect(rec.city.iata).not.toBe('LHR');
      expect(rec.source).toBe('heuristic');
    }
  });

  it('returns recommendations sorted descending by score', async () => {
    const request = baseRequest();
    const recs = await heuristicRecommender.recommend(request, CITY_POOL);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });

  it('is deterministic across repeated calls', async () => {
    const request = baseRequest();
    const a = await heuristicRecommender.recommend(request, CITY_POOL);
    const b = await heuristicRecommender.recommend(request, CITY_POOL);
    expect(a).toEqual(b);
  });

  it('the class can be instantiated directly and behaves the same', async () => {
    const instance = new HeuristicCandidateRecommender();
    const request = baseRequest();
    const a = await instance.recommend(request, CITY_POOL);
    const b = await heuristicRecommender.recommend(request, CITY_POOL);
    expect(a).toEqual(b);
  });
});
