import { api } from "@/services/api";
import type { FplBootstrapRaw, FplFixtureRaw } from "../types/api";

/**
 * Public Fantasy Premier League API endpoints.
 *
 * All paths are relative to the configured API base URL (`VITE_API_BASE_URL`,
 * default `/api`). In development the Vite dev server proxies `/api` to
 * `https://fantasy.premierleague.com/api`, which avoids CORS and keeps the
 * FPL host out of client code.
 */
export const FPL_ENDPOINTS = {
  /** Core static data: players, teams, positions, gameweeks. */
  bootstrapStatic: "/bootstrap-static/",
  /** All fixtures for the season. Optional `?event=` narrows to a gameweek. */
  fixtures: "/fixtures/",
  /** Per-player detailed history & upcoming fixtures. */
  elementSummary: (playerId: number) => `/element-summary/${playerId}/`,
} as const;

/**
 * Fetch the bootstrap-static payload.
 * @param signal AbortSignal forwarded by TanStack Query for cancellation.
 */
export function fetchBootstrap(signal?: AbortSignal): Promise<FplBootstrapRaw> {
  return api.get<FplBootstrapRaw>(FPL_ENDPOINTS.bootstrapStatic, { signal });
}

/**
 * Fetch fixtures, optionally scoped to a single gameweek.
 * @param event Gameweek id to filter by; omit for the full season.
 * @param signal AbortSignal forwarded by TanStack Query.
 */
export function fetchFixtures(
  event?: number,
  signal?: AbortSignal,
): Promise<FplFixtureRaw[]> {
  return api.get<FplFixtureRaw[]>(FPL_ENDPOINTS.fixtures, {
    signal,
    params: event !== undefined ? { event } : undefined,
  });
}
