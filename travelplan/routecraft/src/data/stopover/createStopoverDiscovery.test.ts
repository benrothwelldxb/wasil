import { describe, expect, it } from 'vitest';
import type { SearchCriteria } from '@/domain/types';
import { searchResultSchema } from '@/domain/schemas';
import { isProviderError } from '@/data/provider/errors';
import { criteriaToDiscoveryRequest, discoverJourneys } from './createStopoverDiscovery';

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

describe('discoverJourneys', () => {
  it('returns a searchResultSchema-valid result with at least one journey for DXB -> MAN', async () => {
    const criteria = baseCriteria();
    const result = await discoverJourneys(criteria);

    expect(() => searchResultSchema.parse(result)).not.toThrow();
    expect(result.journeys.length).toBeGreaterThan(0);
    expect(result.providerId).toBe('stopover-v1');
  });

  it('includes at least one stopover journey', async () => {
    const result = await discoverJourneys(baseCriteria());
    expect(result.journeys.some((j) => j.kind === 'stopover')).toBe(true);
  });

  it('is ranked: journeys are sorted descending by score.total', async () => {
    const result = await discoverJourneys(baseCriteria());
    for (let i = 1; i < result.journeys.length; i++) {
      expect(result.journeys[i - 1].score.total).toBeGreaterThanOrEqual(
        result.journeys[i].score.total,
      );
    }
  });

  it('is deterministic across repeated runs', async () => {
    const a = await discoverJourneys(baseCriteria());
    const b = await discoverJourneys(baseCriteria());
    expect(a).toEqual(b);
  });

  it('rejects with ProviderError("UNKNOWN_AIRPORT") for an unknown origin', async () => {
    const err = await discoverJourneys(baseCriteria({ origin: 'ZZZ' })).catch(
      (e: unknown) => e,
    );
    expect(isProviderError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'UNKNOWN_AIRPORT' });
  });

  it('rejects with ProviderError("UNKNOWN_AIRPORT") for an unknown destination', async () => {
    const err = await discoverJourneys(baseCriteria({ destination: 'ZZZ' })).catch(
      (e: unknown) => e,
    );
    expect(isProviderError(err)).toBe(true);
    expect(err).toMatchObject({ code: 'UNKNOWN_AIRPORT' });
  });
});

describe('criteriaToDiscoveryRequest', () => {
  it('maps the shared fields and fixes maxStopoverNights from criteria', () => {
    const criteria = baseCriteria({ maxStopoverNights: 3 });
    const request = criteriaToDiscoveryRequest(criteria);

    expect(request).toEqual({
      origin: criteria.origin,
      destination: criteria.destination,
      maxStopoverNights: 3,
      budget: criteria.budget,
      departureDate: criteria.departureDate,
      pax: criteria.pax,
      cabin: criteria.cabin,
      preferences: criteria.preferences,
    });
  });
});
