/**
 * Centralised route path constants. Import these instead of hard-coding
 * string literals so paths stay consistent and are trivial to refactor.
 */
export const ROUTES = {
  dashboard: "/",
  players: "/players",
  ratings: "/ratings",
  predictions: "/predictions",
  optimiser: "/optimiser",
  lineup: "/lineup",
  live: "/live",
  transfers: "/transfers",
  squad: "/squad",
  fixtures: "/fixtures",
  team: "/team",
  analyse: "/analyse",
  preferences: "/preferences",
  onboarding: "/onboarding",
  settings: "/settings",
  debug: "/debug",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
