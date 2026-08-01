/**
 * Centralised route path constants. Import these instead of hard-coding
 * string literals so paths stay consistent and are trivial to refactor.
 */
export const ROUTES = {
  dashboard: "/",
  team: "/team",
  analyse: "/analyse",
  settings: "/settings",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
