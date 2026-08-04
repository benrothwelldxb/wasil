import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_FILTERS, useUiStore } from './ui-store';

const STORAGE_KEY = 'routecraft-ui';

function resetStore() {
  window.localStorage.clear();
  useUiStore.setState({
    theme: 'dark',
    sort: 'experience',
    filters: DEFAULT_FILTERS,
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe('useUiStore theme', () => {
  it('toggleTheme flips dark to light and back', () => {
    useUiStore.setState({ theme: 'dark' });

    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('light');

    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('dark');
  });

  it('setTheme sets the theme directly', () => {
    useUiStore.getState().setTheme('light');
    expect(useUiStore.getState().theme).toBe('light');

    useUiStore.getState().setTheme('dark');
    expect(useUiStore.getState().theme).toBe('dark');
  });
});

describe('useUiStore filters', () => {
  it('setFilters patches only the provided keys', () => {
    useUiStore.getState().setFilters({ maxStops: 1 });

    expect(useUiStore.getState().filters).toEqual({
      ...DEFAULT_FILTERS,
      maxStops: 1,
    });
  });

  it('setFilters can be called repeatedly to accumulate patches', () => {
    useUiStore.getState().setFilters({ maxStops: 1 });
    useUiStore.getState().setFilters({ minScore: 40, excludeRedEye: true });

    expect(useUiStore.getState().filters).toEqual({
      ...DEFAULT_FILTERS,
      maxStops: 1,
      minScore: 40,
      excludeRedEye: true,
    });
  });

  it('resetFilters restores the default filters', () => {
    useUiStore.getState().setFilters({ maxStops: 0, minScore: 90, excludeRedEye: true });
    useUiStore.getState().resetFilters();

    expect(useUiStore.getState().filters).toEqual(DEFAULT_FILTERS);
  });
});

describe('useUiStore persistence', () => {
  it('only persists theme, not sort or filters', () => {
    useUiStore.getState().setTheme('light');
    useUiStore.getState().setSort('price');
    useUiStore.getState().setFilters({ maxStops: 1, minScore: 50 });

    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown>; version: number };
    expect(parsed.state).toEqual({ theme: 'light' });
    expect(parsed.state.sort).toBeUndefined();
    expect(parsed.state.filters).toBeUndefined();
    expect(parsed.version).toBe(1);
  });
});
