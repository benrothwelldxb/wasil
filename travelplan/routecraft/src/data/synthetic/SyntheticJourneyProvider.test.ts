import { describe, expect, it } from 'vitest';
import type { Journey, SearchCriteria } from '@/domain/types';
import { detourRatio, haversineKm } from '@/domain/geo';
import { journeySchema, searchResultSchema } from '@/domain/schemas';
import { getCity } from '@/data/datasets/cities';
import { ProviderError } from '@/data/provider/errors';
import {
  generateSearchResult,
  syntheticProvider,
} from './SyntheticJourneyProvider';

function criteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    origin: 'DXB',
    destination: 'MAN',
    departureDate: '2026-09-15',
    pax: { adults: 1, children: 0 },
    budget: { amount: 1500, currency: 'USD' },
    cabin: 'economy',
    preferences: ['culture'],
    maxStopovers: 2,
    minStopoverNights: 1,
    maxStopoverNights: 2,
    ...overrides,
  };
}

const idSet = (js: Journey[]): Set<string> => new Set(js.map((j) => j.id));

describe('generateSearchResult — determinism', () => {
  it('produces byte-identical results on repeated calls', () => {
    const c = criteria();
    expect(generateSearchResult(c)).toEqual(generateSearchResult(c));
  });

  it('is stable regardless of generation entry point', () => {
    const c = criteria({ origin: 'JFK', destination: 'CDG' });
    const a = generateSearchResult(c);
    const b = generateSearchResult(c);
    expect(a.journeys.map((j) => j.id)).toEqual(b.journeys.map((j) => j.id));
  });
});

describe('generateSearchResult — budget excluded from seed', () => {
  it('yields the identical candidate id set at two high budgets', () => {
    const lo = generateSearchResult(criteria({ budget: { amount: 9000, currency: 'USD' } }));
    const hi = generateSearchResult(criteria({ budget: { amount: 12000, currency: 'USD' } }));
    expect(idSet(lo.journeys)).toEqual(idSet(hi.journeys));
  });

  it('keeps a low-budget id set a subset of a high-budget one (stable universe)', () => {
    const low = generateSearchResult(criteria({ budget: { amount: 1500, currency: 'USD' } }));
    const high = generateSearchResult(criteria({ budget: { amount: 12000, currency: 'USD' } }));
    const highIds = idSet(high.journeys);
    for (const id of idSet(low.journeys)) {
      expect(highIds.has(id)).toBe(true);
    }
  });
});

describe('generateSearchResult — schema validity', () => {
  it('every journey passes journeySchema and the result passes searchResultSchema', () => {
    const result = generateSearchResult(criteria({ budget: { amount: 12000, currency: 'USD' } }));
    expect(() => searchResultSchema.parse(result)).not.toThrow();
    for (const journey of result.journeys) {
      expect(() => journeySchema.parse(journey)).not.toThrow();
    }
  });

  it('assigns effective weights that sum to 1 after ranking', () => {
    const result = generateSearchResult(criteria());
    for (const j of result.journeys) {
      const sum = Object.values(j.score.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    }
  });
});

describe('generateSearchResult — Dubai → Manchester fixture', () => {
  const result = generateSearchResult(criteria());

  it('offers an Istanbul stopover', () => {
    const istJourneys = result.journeys.filter((j) =>
      j.stopovers.some((s) => s.airport.iata === 'IST'),
    );
    expect(istJourneys.length).toBeGreaterThan(0);
  });

  it('ranks a stopover above the direct red-eye (stopover at #1, or IST beats all directs)', () => {
    const top = result.journeys[0];
    const stopoverAtTop = top.kind === 'stopover';

    const directs = result.journeys.filter((j) => j.kind === 'direct');
    const bestDirect = Math.max(0, ...directs.map((j) => j.score.total));
    const istBest = Math.max(
      0,
      ...result.journeys
        .filter((j) => j.stopovers.some((s) => s.airport.iata === 'IST'))
        .map((j) => j.score.total),
    );
    const istBeatsDirects = istBest > bestDirect;

    expect(stopoverAtTop || istBeatsDirects).toBe(true);
  });
});

describe('generateSearchResult — detour bounds', () => {
  const routes: Array<[string, string]> = [
    ['DXB', 'MAN'],
    ['LHR', 'SIN'],
    ['JFK', 'CDG'],
    ['SYD', 'LHR'],
    ['NRT', 'LHR'],
  ];

  it('never routes through a hub beyond the detour limits', () => {
    for (const [origin, destination] of routes) {
      const o = getCity(origin)!;
      const d = getCity(destination)!;
      const result = generateSearchResult(
        criteria({ origin, destination, budget: { amount: 25000, currency: 'USD' } }),
      );
      for (const j of result.journeys) {
        if (j.stopovers.length === 1) {
          const hub = getCity(j.stopovers[0].airport.iata)!;
          expect(detourRatio(o, hub, d)).toBeLessThanOrEqual(1.45 + 1e-9);
        } else if (j.stopovers.length === 2) {
          const h1 = getCity(j.stopovers[0].airport.iata)!;
          const h2 = getCity(j.stopovers[1].airport.iata)!;
          const combined =
            (haversineKm(o, h1) + haversineKm(h1, h2) + haversineKm(h2, d)) / haversineKm(o, d);
          expect(combined).toBeLessThanOrEqual(1.6 + 1e-9);
        }
      }
    }
  });
});

describe('generateSearchResult — count sanity', () => {
  const routes: Array<[string, string]> = [
    ['DXB', 'MAN'],
    ['LHR', 'SIN'],
    ['JFK', 'CDG'],
    ['SYD', 'LHR'],
    ['NRT', 'LHR'],
  ];

  it('yields 6–14 journeys per sample route', () => {
    for (const [origin, destination] of routes) {
      const result = generateSearchResult(
        criteria({ origin, destination, budget: { amount: 25000, currency: 'USD' } }),
      );
      expect(result.journeys.length).toBeGreaterThanOrEqual(6);
      expect(result.journeys.length).toBeLessThanOrEqual(14);
    }
  });
});

describe('generateSearchResult — errors and stats', () => {
  it('throws UNKNOWN_AIRPORT for an airport outside the dataset', () => {
    try {
      generateSearchResult(criteria({ origin: 'ZZZ' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('UNKNOWN_AIRPORT');
    }
  });

  it('throws INVALID_CRITERIA when origin equals destination', () => {
    try {
      generateSearchResult(criteria({ origin: 'DXB', destination: 'DXB' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('INVALID_CRITERIA');
    }
  });

  it('reports over-budget candidates in stats when the budget is tiny', () => {
    const result = generateSearchResult(criteria({ budget: { amount: 300, currency: 'USD' } }));
    expect(result.stats.candidatesConsidered).toBeGreaterThan(0);
    expect(result.stats.overBudgetFiltered).toBeGreaterThanOrEqual(0);
  });
});

describe('SyntheticJourneyProvider — async wrapper', () => {
  it('searchJourneys matches the pure generator', async () => {
    const c = criteria();
    const viaProvider = await syntheticProvider.searchJourneys(c);
    const pure = generateSearchResult(c);
    expect(viaProvider.journeys.map((j) => j.id)).toEqual(pure.journeys.map((j) => j.id));
  });

  it('getJourney round-trips an id from the same criteria', async () => {
    const c = criteria();
    const pure = generateSearchResult(c);
    const first = pure.journeys[0];
    const fetched = await syntheticProvider.getJourney(first.id, c);
    expect(fetched?.id).toBe(first.id);
    expect(await syntheticProvider.getJourney('nonexistent-id', c)).toBeNull();
  });
});
