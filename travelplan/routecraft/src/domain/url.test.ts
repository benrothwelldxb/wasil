import { describe, expect, it } from 'vitest';
import type { SearchCriteria } from './types';
import {
  criteriaKey,
  criteriaToJourneyPath,
  criteriaToResultsPath,
  criteriaToSearchParams,
} from './url';

const base: SearchCriteria = {
  origin: 'DXB',
  destination: 'MAN',
  departureDate: '2026-09-15',
  pax: { adults: 2, children: 1 },
  budget: { amount: 1500, currency: 'USD' },
  cabin: 'economy',
  preferences: ['culture', 'food'],
  maxStopovers: 2,
  minStopoverNights: 1,
  maxStopoverNights: 2,
};

describe('criteriaToSearchParams', () => {
  it('serialises the core fields and joins preferences', () => {
    const p = criteriaToSearchParams(base);
    expect(p.get('origin')).toBe('DXB');
    expect(p.get('destination')).toBe('MAN');
    expect(p.get('adults')).toBe('2');
    expect(p.get('children')).toBe('1');
    expect(p.get('budget')).toBe('1500');
    expect(p.get('preferences')).toBe('culture,food');
    expect(p.has('returnDate')).toBe(false);
  });

  it('includes returnDate when present', () => {
    const p = criteriaToSearchParams({ ...base, returnDate: '2026-09-22' });
    expect(p.get('returnDate')).toBe('2026-09-22');
  });
});

describe('paths and key', () => {
  it('builds results and journey paths', () => {
    expect(criteriaToResultsPath(base)).toMatch(/^\/results\?origin=DXB/);
    expect(criteriaToJourneyPath('abc123', base)).toMatch(/^\/journeys\/abc123\?origin=DXB/);
  });

  it('criteriaKey is stable regardless of construction order', () => {
    const reordered: SearchCriteria = {
      ...base,
      // same values, object built differently
      preferences: [...base.preferences],
    };
    expect(criteriaKey(reordered)).toBe(criteriaKey(base));
  });
});
