import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_JOURNEY_SCORE_WEIGHTS, JOURNEY_SCORE_FACTORS } from '@/domain/journey-score';

import { useJourneyScoreImportances, useJourneyScoreStore } from './journey-score-store';

const STORAGE_KEY = 'routecraft-journey-weights';

// Reset in `beforeEach` only (never `afterEach`): a test that mounts a
// component (e.g. via `renderHook`) is still mounted when `afterEach` hooks
// run, before Testing Library's own `afterEach(cleanup)` unmounts it —
// mutating the store's state at that point trips React's "not wrapped in
// act" warning for the still-subscribed component.
function resetStore() {
  window.localStorage.clear();
  useJourneyScoreStore.setState({ importances: { ...DEFAULT_JOURNEY_SCORE_WEIGHTS } });
}

beforeEach(() => {
  resetStore();
});

describe('useJourneyScoreStore defaults', () => {
  it('seeds importances from DEFAULT_JOURNEY_SCORE_WEIGHTS', () => {
    expect(useJourneyScoreStore.getState().importances).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);
  });

  it('has one importance per Journey Score factor', () => {
    const keys = Object.keys(useJourneyScoreStore.getState().importances).sort();
    expect(keys).toEqual([...JOURNEY_SCORE_FACTORS].sort());
  });
});

describe('useJourneyScoreStore setImportance', () => {
  it('updates a single factor, leaving the rest untouched', () => {
    useJourneyScoreStore.getState().setImportance('cost', 0.5);

    expect(useJourneyScoreStore.getState().importances).toEqual({
      ...DEFAULT_JOURNEY_SCORE_WEIGHTS,
      cost: 0.5,
    });
  });

  it('can be called repeatedly to accumulate patches', () => {
    useJourneyScoreStore.getState().setImportance('cost', 0.5);
    useJourneyScoreStore.getState().setImportance('safety', 0.3);

    expect(useJourneyScoreStore.getState().importances).toEqual({
      ...DEFAULT_JOURNEY_SCORE_WEIGHTS,
      cost: 0.5,
      safety: 0.3,
    });
  });

  it('clamps negative values to 0', () => {
    useJourneyScoreStore.getState().setImportance('jetLag', -5);
    expect(useJourneyScoreStore.getState().importances.jetLag).toBe(0);
  });

  it('accepts 0 as a valid value', () => {
    useJourneyScoreStore.getState().setImportance('weather', 0);
    expect(useJourneyScoreStore.getState().importances.weather).toBe(0);
  });
});

describe('useJourneyScoreStore resetImportances', () => {
  it('restores the RouteCraft-default importances', () => {
    useJourneyScoreStore.getState().setImportance('cost', 0.9);
    useJourneyScoreStore.getState().setImportance('duration', 0);

    useJourneyScoreStore.getState().resetImportances();

    expect(useJourneyScoreStore.getState().importances).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);
  });
});

describe('useJourneyScoreImportances', () => {
  it('reads the current importances from the store, live', () => {
    const { result } = renderHook(() => useJourneyScoreImportances());
    expect(result.current).toEqual(DEFAULT_JOURNEY_SCORE_WEIGHTS);

    act(() => {
      useJourneyScoreStore.getState().setImportance('cost', 0.77);
    });

    expect(result.current).toEqual({ ...DEFAULT_JOURNEY_SCORE_WEIGHTS, cost: 0.77 });
  });
});

describe('useJourneyScoreStore persistence', () => {
  it('persists only the importances, under the expected key and version', () => {
    useJourneyScoreStore.getState().setImportance('cost', 0.42);

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown>; version: number };
    expect(parsed.state).toEqual({
      importances: { ...DEFAULT_JOURNEY_SCORE_WEIGHTS, cost: 0.42 },
    });
    expect(parsed.version).toBe(1);
  });
});
