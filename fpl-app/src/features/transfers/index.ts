/**
 * Transfer Planner — public API.
 *
 * Recommends the best single transfer, best double transfer, and best wildcard
 * squad for the user's saved squad, accounting for the bank, free-transfer
 * limits, and point hits. Each recommendation is explained. No auto-applying —
 * it only advises.
 */
export * from "./types";
export {
  lineupTotal,
  bestSingle,
  bestDouble,
  bestWildcard,
} from "./engine";
export {
  useTransferSettings,
  MAX_FREE_TRANSFERS,
  TRANSFER_HIT_COST,
} from "./store";
export { useTransfers, type UseTransfersResult } from "./useTransfers";
export { useHorizonPlan, type UseHorizonPlanResult } from "./useHorizonPlan";
export * from "./components";
