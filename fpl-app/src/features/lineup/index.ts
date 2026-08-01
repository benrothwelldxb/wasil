/**
 * Lineup & Captaincy — public API.
 *
 * Given a legal 15-man squad, auto-picks the best XI, bench order, captain and
 * vice from the prediction engine's projected points, shows the projected
 * score, and supports instant manual overrides. No transfer logic.
 */
export * from "./types";
export {
  autoPickLineup,
  isLegalEleven,
  formationOf,
} from "./autopick";
export { projectLineup } from "./projection";
export { useLineup, type UseLineupResult, type LineupPlayer } from "./useLineup";
export * from "./components";
