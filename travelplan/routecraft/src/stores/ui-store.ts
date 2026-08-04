/**
 * UI / view state — theme plus the client-side view controls applied over the
 * (TanStack Query-owned) journey data. Changing a filter or sort NEVER refetches;
 * it only re-derives the view. Journey data is never stored here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type SortMode = 'experience' | 'price' | 'duration' | 'value';

export interface ResultFilters {
  maxStops: 0 | 1 | 2;
  minScore: number; // 0–100
  priceCeiling: number | null; // view ceiling under the committed budget
  excludeRedEye: boolean;
}

export const DEFAULT_FILTERS: ResultFilters = {
  maxStops: 2,
  minScore: 0,
  priceCeiling: null,
  excludeRedEye: false,
};

interface UiState {
  theme: Theme;
  sort: SortMode;
  filters: ResultFilters;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setSort: (sort: SortMode) => void;
  setFilters: (patch: Partial<ResultFilters>) => void;
  resetFilters: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sort: 'experience',
      filters: DEFAULT_FILTERS,
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),
      setSort: (sort) => set({ sort }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
    }),
    {
      name: 'routecraft-ui',
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
);
