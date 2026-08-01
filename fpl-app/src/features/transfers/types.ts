import type { OptiPlayer, Formation } from "@/features/optimiser";

/** A player as used by the transfer engine (id, cost, projected value). */
export type TransferPlayer = OptiPlayer;

/** A recommended set of transfers (1, 2, or a full wildcard). */
export interface TransferMove {
  out: TransferPlayer[];
  in: TransferPlayer[];
  /** Raw projected-score gain (best-XI + captain), before any hits. */
  gain: number;
  /** Number of transfers made. */
  transfers: number;
  /** Points deducted for exceeding free transfers. */
  hit: number;
  /** gain − hit. */
  net: number;
  /** Money left after the move, in tenths. */
  moneyRemaining: number;
  /** Formation of the resulting best XI (wildcard). */
  formation?: Formation;
  reasons: string[];
}

/** All three recommendations for the current squad. */
export interface TransferPlans {
  /** Current best-XI projected score. */
  currentProjected: number;
  bank: number;
  freeTransfers: number;
  window: number;
  single: TransferMove | null;
  double: TransferMove | null;
  wildcard: TransferMove | null;
}
