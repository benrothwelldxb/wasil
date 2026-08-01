/**
 * Feature modules. Each feature is a self-contained vertical slice exposing a
 * public API through its own barrel.
 *
 * - `fpl` — the Fantasy Premier League data layer (models, API service, and
 *   TanStack Query hooks).
 * - `player-explorer` — browse/filter/sort every player. No squad builder yet.
 */
export * as fpl from "./fpl";
export * as playerExplorer from "./player-explorer";
