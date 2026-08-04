/**
 * Draft search form state. Client-owned and mutable; survives navigation back
 * to the landing page. On `/results` the store is rehydrated FROM the URL, never
 * the reverse — the URL is the source of truth for a committed search.
 */
import { create } from 'zustand';
import type { CabinClass, SearchCriteria, TravelPreference } from '@/domain/types';

export interface SearchDraft {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  budget: number;
  cabin: CabinClass;
  preferences: TravelPreference[];
  maxStopovers: 0 | 1 | 2;
  maxStopoverNights: 1 | 2 | 3;
}

export const DEFAULT_DRAFT: SearchDraft = {
  origin: '',
  destination: '',
  departureDate: '',
  adults: 1,
  children: 0,
  budget: 1500,
  cabin: 'economy',
  preferences: [],
  maxStopovers: 2,
  maxStopoverNights: 2,
};

interface SearchState {
  draft: SearchDraft;
  setDraft: (patch: Partial<SearchDraft>) => void;
  loadFromCriteria: (criteria: SearchCriteria) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  draft: DEFAULT_DRAFT,
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  loadFromCriteria: (criteria) =>
    set({
      draft: {
        origin: criteria.origin,
        destination: criteria.destination,
        departureDate: criteria.departureDate,
        ...(criteria.returnDate ? { returnDate: criteria.returnDate } : {}),
        adults: criteria.pax.adults,
        children: criteria.pax.children,
        budget: criteria.budget.amount,
        cabin: criteria.cabin,
        preferences: criteria.preferences,
        maxStopovers: criteria.maxStopovers,
        maxStopoverNights: criteria.maxStopoverNights,
      },
    }),
  reset: () => set({ draft: DEFAULT_DRAFT }),
}));

/** Build a validated-shape criteria object from a draft (validated by Zod at submit). */
export function draftToCriteria(draft: SearchDraft): SearchCriteria {
  return {
    origin: draft.origin.toUpperCase(),
    destination: draft.destination.toUpperCase(),
    departureDate: draft.departureDate,
    ...(draft.returnDate ? { returnDate: draft.returnDate } : {}),
    pax: { adults: draft.adults, children: draft.children },
    budget: { amount: draft.budget, currency: 'USD' },
    cabin: draft.cabin,
    preferences: draft.preferences,
    maxStopovers: draft.maxStopovers,
    minStopoverNights: 1,
    maxStopoverNights: draft.maxStopoverNights,
  };
}
