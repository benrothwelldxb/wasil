/**
 * Squad Optimiser — public API.
 *
 * Given a budget, player projected points (from the prediction engine), and
 * the FPL rules, it finds the mathematically highest-scoring legal 15-man
 * squad and best starting XI across all formations, with a per-player
 * explanation. No transfer logic.
 */
export * from "./types";
export {
  FORMATIONS,
  DEFAULT_RULES,
  SEARCH,
  POSITION_NAME,
} from "./config";
export {
  optimiseSquad,
  bestEleven,
  isValidSquad,
  type OptimiseOptions,
} from "./engine";
export { buildReasons } from "./reasons";
export { useOptimiser, type UseOptimiserResult } from "./useOptimiser";
export * from "./components";
