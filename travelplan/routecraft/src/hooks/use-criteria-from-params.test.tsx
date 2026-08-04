import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SearchCriteria } from '@/domain/types';
import { criteriaToSearchParams } from '@/domain/url';
import { useCriteriaFromParams } from './use-criteria-from-params';

const criteria: SearchCriteria = {
  origin: 'DXB',
  destination: 'MAN',
  departureDate: '2026-09-15',
  pax: { adults: 2, children: 1 },
  budget: { amount: 2500, currency: 'USD' },
  cabin: 'economy',
  preferences: ['culture', 'food'],
  maxStopovers: 2,
  minStopoverNights: 1,
  maxStopoverNights: 3,
};

function wrapperFor(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

describe('useCriteriaFromParams', () => {
  it('parses valid search params into criteria', () => {
    const url = `/results?${criteriaToSearchParams(criteria).toString()}`;
    const { result } = renderHook(() => useCriteriaFromParams(), { wrapper: wrapperFor(url) });

    expect(result.current.error).toBeNull();
    expect(result.current.criteria).not.toBeNull();
    expect(result.current.criteria?.origin).toBe('DXB');
    expect(result.current.criteria?.destination).toBe('MAN');
    expect(result.current.criteria?.pax).toEqual({ adults: 2, children: 1 });
    expect(result.current.criteria?.budget.amount).toBe(2500);
  });

  it('round-trips: criteriaToSearchParams -> useCriteriaFromParams yields equal criteria', () => {
    const url = `/results?${criteriaToSearchParams(criteria).toString()}`;
    const { result } = renderHook(() => useCriteriaFromParams(), { wrapper: wrapperFor(url) });

    const parsed = result.current.criteria;
    expect(parsed).not.toBeNull();
    // Every field the URL is the source of truth for survives the round-trip.
    expect(parsed?.origin).toBe(criteria.origin);
    expect(parsed?.destination).toBe(criteria.destination);
    expect(parsed?.departureDate).toBe(criteria.departureDate);
    expect(parsed?.cabin).toBe(criteria.cabin);
    expect(parsed?.preferences).toEqual(criteria.preferences);
    expect(parsed?.maxStopovers).toBe(criteria.maxStopovers);
    expect(parsed?.maxStopoverNights).toBe(criteria.maxStopoverNights);
    expect(parsed?.budget.amount).toBe(criteria.budget.amount);
  });

  it('returns an error and null criteria for an invalid origin', () => {
    const { result } = renderHook(() => useCriteriaFromParams(), {
      wrapper: wrapperFor('/results?origin=not-an-iata&destination=MAN&departureDate=2026-09-15'),
    });

    expect(result.current.criteria).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('returns an error when required params are missing', () => {
    const { result } = renderHook(() => useCriteriaFromParams(), {
      wrapper: wrapperFor('/results'),
    });

    expect(result.current.criteria).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
