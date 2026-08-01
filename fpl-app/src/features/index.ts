/**
 * Feature modules. Each feature is a self-contained vertical slice exposing a
 * public API through its own barrel.
 *
 * - `fpl` — the Fantasy Premier League data layer (models, API service, and
 *   TanStack Query hooks). No product features (e.g. squad selection) yet.
 */
export * as fpl from "./fpl";
