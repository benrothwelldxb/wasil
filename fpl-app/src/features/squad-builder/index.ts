/**
 * Squad Builder feature — public API.
 *
 * Assemble a 15-player FPL squad under the official rules (budget, position
 * quotas, three-per-club), with live validation, one-click add/remove, and
 * localStorage persistence. No optimisation logic yet.
 */
export * from "./components";
export { useSquad } from "./useSquad";
export type { UseSquadResult } from "./useSquad";
export { useSquadStore } from "./squadStore";
export {
  SQUAD_RULES,
  POSITION_TARGETS,
  computeSquadState,
  checkCanAdd,
} from "./rules";
export type { SquadState, SquadIssue, AddCheck } from "./types";
