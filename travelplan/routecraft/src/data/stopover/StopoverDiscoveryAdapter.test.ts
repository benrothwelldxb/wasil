import { describe, expect, it } from 'vitest';
import type { SearchCriteria } from '@/domain/types';
import { searchResultSchema } from '@/domain/schemas';
import { normaliseSynthetic } from '@/data/normalise';
import { rankJourneys } from '@/domain/scoring';
import { createFakeLogger } from '@/test/fixtures/raw-payloads';
import { StopoverDiscoveryAdapter, stopoverDiscoveryAdapter } from './StopoverDiscoveryAdapter';

function baseCriteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    origin: 'DXB',
    destination: 'MAN',
    departureDate: '2026-09-15',
    pax: { adults: 1, children: 0 },
    budget: { amount: 2200, currency: 'USD' },
    cabin: 'economy',
    preferences: ['culture'],
    maxStopovers: 1,
    minStopoverNights: 1,
    maxStopoverNights: 2,
    ...overrides,
  };
}

describe('StopoverDiscoveryAdapter', () => {
  it('has the expected adapter identity', () => {
    expect(stopoverDiscoveryAdapter.id).toBe('stopover-v1');
    expect(stopoverDiscoveryAdapter.supportsGetJourney).toBe(true);
  });

  it('search() returns {source: "synthetic-v1", result} with a valid SearchResult', async () => {
    const adapter = new StopoverDiscoveryAdapter();
    const criteria = baseCriteria();

    const raw = await adapter.search(criteria);

    expect(raw.source).toBe('synthetic-v1');
    expect(() => searchResultSchema.parse(raw.result)).not.toThrow();
    expect(raw.result.journeys.length).toBeGreaterThan(0);
    expect(raw.result.providerId).toBe('stopover-v1');
  });

  it('composes with the existing engine pipeline: normaliseSynthetic + rankJourneys yield valid ranked journeys', async () => {
    const adapter = new StopoverDiscoveryAdapter();
    const criteria = baseCriteria();

    const raw = await adapter.search(criteria);
    const normalised = normaliseSynthetic(raw, { criteria, logger: createFakeLogger() });
    const ranked = rankJourneys(normalised.journeys, criteria);
    const result = { ...normalised, journeys: ranked };

    expect(() => searchResultSchema.parse(result)).not.toThrow();
    expect(result.journeys.length).toBeGreaterThan(0);
    for (let i = 1; i < result.journeys.length; i++) {
      expect(result.journeys[i - 1].score.total).toBeGreaterThanOrEqual(
        result.journeys[i].score.total,
      );
    }
  });
});
