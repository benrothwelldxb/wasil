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
 * - `scoring` — deterministic (no-AI) player scoring engine that consumes the
 *   PreferenceService to personalise ratings.
 * - `predictions` — statistical (no-AI) Expected Points engine (GW 1/3/5/8),
 *   behind a swappable interface for future ML. Consumed by optimiser, captain
 *   selector, transfer planner, and AI manager.
 * - `optimiser` — finds the highest-scoring legal squad from projected points.
 *   No transfer logic.
 * - `lineup` — best XI, bench order, captain & vice from a legal squad, with
 *   manual overrides. No transfer logic.
 * - `transfers` — best single/double/wildcard recommendations with hits and
 *   reasoning. Advisory only.
 */
export * as compare from "./compare";
export * as differentials from "./differentials";
export * as dashboard from "./dashboard";
export * as live from "./live";
export * as manager from "./manager";
export * as priceWatch from "./price-watch";
export * as pwa from "./pwa";
export * as share from "./share";
export * as fpl from "./fpl";
export * as fixtures from "./fixtures";
export * as playerExplorer from "./player-explorer";
export * as squadBuilder from "./squad-builder";
export * as preferences from "./preferences";
export * as scoring from "./scoring";
export * as predictions from "./predictions";
export * as optimiser from "./optimiser";
export * as lineup from "./lineup";
export * as transfers from "./transfers";
