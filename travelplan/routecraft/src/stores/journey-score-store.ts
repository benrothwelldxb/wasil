/**
 * Persisted Zustand store of the user's Journey Score "importances" — raw,
 * non-negative slider values per factor (see ALGORITHM.md §"User-adjustable
 * weighting"). These are NOT weights themselves: `normalizeWeights` turns
 * them into a valid `JourneyScoreWeights` (always sums to 1) at read time.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_JOURNEY_SCORE_WEIGHTS } from '@/domain/journey-score';
import type { JourneyScoreFactorKey } from '@/domain/journey-score';

export type JourneyScoreImportances = Record<JourneyScoreFactorKey, number>;

/** The default importances that seed the UI — RouteCraft's own weights. */
const DEFAULT_IMPORTANCES: JourneyScoreImportances = { ...DEFAULT_JOURNEY_SCORE_WEIGHTS };

interface PersistedJourneyScoreState {
  importances: JourneyScoreImportances;
}

interface JourneyScoreState {
  importances: JourneyScoreImportances;
  /** Sets a single factor's importance, clamping negatives to 0. */
  setImportance: (factor: JourneyScoreFactorKey, value: number) => void;
  /** Restores the RouteCraft-default importances. */
  resetImportances: () => void;
}

export const useJourneyScoreStore = create<JourneyScoreState>()(
  persist(
    (set) => ({
      importances: DEFAULT_IMPORTANCES,
      setImportance: (factor, value) =>
        set((state) => ({
          importances: { ...state.importances, [factor]: Math.max(0, value) },
        })),
      resetImportances: () => set({ importances: DEFAULT_IMPORTANCES }),
    }),
    {
      name: 'routecraft-journey-weights',
      version: 1,
      partialize: (state) => ({ importances: state.importances }),
      migrate: (persistedState) => persistedState as PersistedJourneyScoreState,
    },
  ),
);

/** Selector hook: the current per-factor importances (raw slider values). */
export const useJourneyScoreImportances = (): JourneyScoreImportances =>
  useJourneyScoreStore((s) => s.importances);
