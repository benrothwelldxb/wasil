/**
 * Feature modules. Each feature is a self-contained vertical slice exposing a
 * public API through its own barrel.
 *
 * - `fpl` — the Fantasy Premier League data layer (models, API service, and
 *   TanStack Query hooks).
 * - `player-explorer` — browse/filter/sort every player.
 * - `squad-builder` — assemble a rules-valid 15-player squad. No optimiser yet.
 * - `preferences` — the user-preference engine + PreferenceService consumed by
 *   every future recommendation engine. No optimisation logic.
 */
export * as fpl from "./fpl";
export * as fixtures from "./fixtures";
export * as playerExplorer from "./player-explorer";
export * as squadBuilder from "./squad-builder";
export * as preferences from "./preferences";
