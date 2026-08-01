import { useMemo } from "react";
import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { ApiError } from "@/services/api";
import type { FplBootstrapRaw, FplFixtureRaw } from "../types/api";
import type {
  Fixture,
  FplBootstrap,
  Player,
  PlayerPrice,
  Position,
  Team,
} from "../types/models";
import { fetchBootstrap, fetchFixtures } from "./endpoints";
import { normalizeBootstrap, normalizeFixture } from "./normalizers";
import { fplKeys } from "./queryKeys";
import { BOOTSTRAP_QUERY_CONFIG, FIXTURES_QUERY_CONFIG } from "./config";

/**
 * Memoize normalization per raw payload.
 *
 * All bootstrap-derived selectors (players/teams/positions/prices) run their
 * `select` against the same cached raw object. A WeakMap keyed on that object
 * means the (relatively expensive) normalization happens **once** per fetch,
 * and every selector shares the same normalized instance — so derived arrays
 * keep stable references and don't trigger needless re-renders.
 */
const normalizedCache = new WeakMap<FplBootstrapRaw, FplBootstrap>();

function getNormalizedBootstrap(raw: FplBootstrapRaw): FplBootstrap {
  const cached = normalizedCache.get(raw);
  if (cached) return cached;
  const normalized = normalizeBootstrap(raw);
  normalizedCache.set(raw, normalized);
  return normalized;
}

/**
 * Internal helper: a bootstrap query that selects a slice of the normalized
 * payload. Because the query key is constant, concurrent observers are
 * de-duplicated onto a single `/bootstrap-static/` request.
 */
function useBootstrapSlice<TSelected>(
  select: (bootstrap: FplBootstrap) => TSelected,
): UseQueryResult<TSelected, ApiError> {
  return useQuery<FplBootstrapRaw, ApiError, TSelected>({
    queryKey: fplKeys.bootstrap(),
    queryFn: ({ signal }) => fetchBootstrap(signal),
    select: (raw) => select(getNormalizedBootstrap(raw)),
    ...BOOTSTRAP_QUERY_CONFIG,
  });
}

/** The full normalized bootstrap payload. */
export function useBootstrap(): UseQueryResult<FplBootstrap, ApiError> {
  return useBootstrapSlice((b) => b);
}

/** All players, fully resolved (team & position names, parsed stats, price). */
export function usePlayers(): UseQueryResult<Player[], ApiError> {
  return useBootstrapSlice((b) => b.players);
}

/** All Premier League clubs. */
export function useTeams(): UseQueryResult<Team[], ApiError> {
  return useBootstrapSlice((b) => b.teams);
}

/** All player positions (GKP/DEF/MID/FWD). */
export function usePositions(): UseQueryResult<Position[], ApiError> {
  return useBootstrapSlice((b) => b.positions);
}

/** Derived price list for every player. */
export function usePrices(): UseQueryResult<PlayerPrice[], ApiError> {
  return useBootstrapSlice((b) => b.prices);
}

/** Result shape returned by {@link useFixtures}. */
export interface UseFixturesResult {
  /** Fully-resolved fixtures (team names attached), or `undefined` until ready. */
  data: Fixture[] | undefined;
  /** The raw fixtures payload, if useful. */
  raw: FplFixtureRaw[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: ApiError | null;
  /** Epoch ms of the last successful fixtures fetch. */
  dataUpdatedAt: number;
  refetch: () => void;
}

/**
 * Fixtures for the whole season (or a single gameweek when `event` is given),
 * resolved against team data from the shared bootstrap query.
 *
 * Both underlying queries de-duplicate independently, and the team lookup
 * reuses the same bootstrap request used everywhere else — so enabling this
 * hook adds at most one new network request (the fixtures endpoint).
 */
export function useFixtures(event?: number): UseFixturesResult {
  const teamsQuery = useTeams();
  const fixturesQuery = useQuery<FplFixtureRaw[], ApiError>({
    queryKey: fplKeys.fixtures(event),
    queryFn: ({ signal }) => fetchFixtures(event, signal),
    ...FIXTURES_QUERY_CONFIG,
  });

  const teamsById = useMemo(
    () => new Map((teamsQuery.data ?? []).map((t) => [t.id, t])),
    [teamsQuery.data],
  );

  const data = useMemo<Fixture[] | undefined>(() => {
    if (!fixturesQuery.data) return undefined;
    return fixturesQuery.data.map((f) => normalizeFixture(f, teamsById));
  }, [fixturesQuery.data, teamsById]);

  return {
    data,
    raw: fixturesQuery.data,
    isLoading: fixturesQuery.isLoading || teamsQuery.isLoading,
    isFetching: fixturesQuery.isFetching || teamsQuery.isFetching,
    isError: fixturesQuery.isError || teamsQuery.isError,
    isSuccess: fixturesQuery.isSuccess && teamsQuery.isSuccess,
    error: fixturesQuery.error ?? teamsQuery.error,
    dataUpdatedAt: fixturesQuery.dataUpdatedAt,
    refetch: () => {
      void fixturesQuery.refetch();
      void teamsQuery.refetch();
    },
  };
}
