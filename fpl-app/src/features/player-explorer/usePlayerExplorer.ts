import { useCallback, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks";
import type { Player } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";
import { FIXTURE_COLUMNS, PLAYER_COLUMNS } from "./columns";
import { filterPlayers, sortPlayers } from "./filtering";
import type {
  PlayerFilterState,
  PlayerSort,
  PlayerSortKey,
} from "./types";

const DEFAULT_FILTERS: PlayerFilterState = {
  search: "",
  teamId: null,
  positionId: null,
  priceRange: null,
  minOwnership: 0,
};

const DEFAULT_SORT: PlayerSort = { key: "totalPoints", direction: "desc" };

const NUMERIC_KEYS = new Set<PlayerSortKey>(
  [...PLAYER_COLUMNS, ...FIXTURE_COLUMNS]
    .filter((c) => c.numeric)
    .map((c) => c.key),
);

/** Default sort direction when first sorting by a column. */
function defaultDirection(key: PlayerSortKey): PlayerSort["direction"] {
  return NUMERIC_KEYS.has(key) ? "desc" : "asc";
}

export interface UsePlayerExplorerResult {
  filters: PlayerFilterState;
  sort: PlayerSort;
  /** Filtered + sorted players ready to render. */
  players: Player[];
  /** Whether any filter differs from its default. */
  isFiltered: boolean;
  setSearch: (search: string) => void;
  setTeamId: (teamId: number | null) => void;
  setPositionId: (positionId: number | null) => void;
  setPriceRange: (range: [number, number] | null) => void;
  setMinOwnership: (min: number) => void;
  /** Toggle sort on a column (flips direction if already active). */
  toggleSort: (key: PlayerSortKey) => void;
  /** Set sort explicitly (used by the sort dropdown). */
  setSort: (sort: PlayerSort) => void;
  reset: () => void;
}

/**
 * Owns all Player Explorer view state and derives the visible list.
 *
 * The heavy work — filtering and sorting hundreds of players — is memoized on
 * the *debounced* search term and the individual filter/sort primitives, so it
 * only recomputes when an input actually changes (not on every keystroke or
 * unrelated re-render).
 */
export function usePlayerExplorer(
  allPlayers: Player[],
  fixtureAnalysis?: FixtureAnalysisMap,
): UsePlayerExplorerResult {
  const [filters, setFilters] = useState<PlayerFilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<PlayerSort>(DEFAULT_SORT);

  const debouncedSearch = useDebouncedValue(filters.search, 250);

  const priceMin = filters.priceRange?.[0] ?? null;
  const priceMax = filters.priceRange?.[1] ?? null;

  const players = useMemo(() => {
    const effective: PlayerFilterState = {
      search: debouncedSearch,
      teamId: filters.teamId,
      positionId: filters.positionId,
      priceRange:
        priceMin !== null && priceMax !== null ? [priceMin, priceMax] : null,
      minOwnership: filters.minOwnership,
    };
    return sortPlayers(filterPlayers(allPlayers, effective), sort, {
      fixtures: fixtureAnalysis,
    });
  }, [
    allPlayers,
    debouncedSearch,
    filters.teamId,
    filters.positionId,
    filters.minOwnership,
    priceMin,
    priceMax,
    sort,
    fixtureAnalysis,
  ]);

  const setSearch = useCallback(
    (search: string) => setFilters((f) => ({ ...f, search })),
    [],
  );
  const setTeamId = useCallback(
    (teamId: number | null) => setFilters((f) => ({ ...f, teamId })),
    [],
  );
  const setPositionId = useCallback(
    (positionId: number | null) => setFilters((f) => ({ ...f, positionId })),
    [],
  );
  const setPriceRange = useCallback(
    (priceRange: [number, number] | null) =>
      setFilters((f) => ({ ...f, priceRange })),
    [],
  );
  const setMinOwnership = useCallback(
    (minOwnership: number) => setFilters((f) => ({ ...f, minOwnership })),
    [],
  );

  const toggleSort = useCallback((key: PlayerSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: defaultDirection(key) },
    );
  }, []);

  const reset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
  }, []);

  const isFiltered =
    filters.search !== "" ||
    filters.teamId !== null ||
    filters.positionId !== null ||
    filters.priceRange !== null ||
    filters.minOwnership !== 0;

  return {
    filters,
    sort,
    players,
    isFiltered,
    setSearch,
    setTeamId,
    setPositionId,
    setPriceRange,
    setMinOwnership,
    toggleSort,
    setSort,
    reset,
  };
}
