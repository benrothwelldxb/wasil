import { beforeEach, describe, expect, it } from 'vitest';
import type { SearchCriteria } from '@/domain/types';

import { DEFAULT_DRAFT, draftToCriteria, useSearchStore } from './search-store';

beforeEach(() => {
  useSearchStore.setState({ draft: DEFAULT_DRAFT });
});

describe('useSearchStore draft', () => {
  it('setDraft patches only the provided keys', () => {
    useSearchStore.getState().setDraft({ origin: 'dxb', destination: 'man' });

    expect(useSearchStore.getState().draft).toEqual({
      ...DEFAULT_DRAFT,
      origin: 'dxb',
      destination: 'man',
    });
  });

  it('reset restores the default draft', () => {
    useSearchStore.getState().setDraft({ origin: 'dxb', budget: 3000 });
    useSearchStore.getState().reset();

    expect(useSearchStore.getState().draft).toEqual(DEFAULT_DRAFT);
  });
});

describe('useSearchStore loadFromCriteria', () => {
  const criteria: SearchCriteria = {
    origin: 'DXB',
    destination: 'MAN',
    departureDate: '2026-09-15',
    returnDate: '2026-09-25',
    pax: { adults: 2, children: 1 },
    budget: { amount: 2500, currency: 'USD' },
    cabin: 'business',
    preferences: ['culture', 'food'],
    maxStopovers: 1,
    minStopoverNights: 1,
    maxStopoverNights: 3,
  };

  it('maps a criteria object into the draft', () => {
    useSearchStore.getState().loadFromCriteria(criteria);

    expect(useSearchStore.getState().draft).toEqual({
      origin: 'DXB',
      destination: 'MAN',
      departureDate: '2026-09-15',
      returnDate: '2026-09-25',
      adults: 2,
      children: 1,
      budget: 2500,
      cabin: 'business',
      preferences: ['culture', 'food'],
      maxStopovers: 1,
      maxStopoverNights: 3,
    });
  });

  it('omits returnDate on the draft when the criteria has none', () => {
    const { returnDate: _returnDate, ...withoutReturn } = criteria;
    useSearchStore.getState().loadFromCriteria(withoutReturn);

    expect(useSearchStore.getState().draft.returnDate).toBeUndefined();
  });

  it('round-trips through draftToCriteria back to an equivalent criteria', () => {
    useSearchStore.getState().loadFromCriteria(criteria);
    const roundTripped = draftToCriteria(useSearchStore.getState().draft);

    expect(roundTripped).toEqual(criteria);
  });
});

describe('draftToCriteria', () => {
  it('uppercases origin and destination and maps fields correctly', () => {
    const draft = {
      ...DEFAULT_DRAFT,
      origin: 'dxb',
      destination: 'man',
      departureDate: '2026-10-01',
      adults: 1,
      children: 0,
      budget: 1800,
      cabin: 'economy' as const,
      preferences: ['nature' as const],
      maxStopovers: 2 as const,
      maxStopoverNights: 2 as const,
    };

    const criteria = draftToCriteria(draft);

    expect(criteria).toEqual({
      origin: 'DXB',
      destination: 'MAN',
      departureDate: '2026-10-01',
      pax: { adults: 1, children: 0 },
      budget: { amount: 1800, currency: 'USD' },
      cabin: 'economy',
      preferences: ['nature'],
      maxStopovers: 2,
      minStopoverNights: 1,
      maxStopoverNights: 2,
    });
  });

  it('includes returnDate only when present on the draft', () => {
    const withoutReturn = draftToCriteria(DEFAULT_DRAFT);
    expect(withoutReturn.returnDate).toBeUndefined();

    const withReturn = draftToCriteria({ ...DEFAULT_DRAFT, returnDate: '2026-11-01' });
    expect(withReturn.returnDate).toBe('2026-11-01');
  });
});
