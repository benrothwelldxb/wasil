import {
  POSITION_TARGETS,
  SQUAD_RULES,
} from "@/features/squad-builder";
import type { Formation, OptiRules } from "./types";

/**
 * All eight legal FPL formations (1 GK implied). The optimiser evaluates every
 * one and keeps the best — this is how "multiple formations" are supported.
 */
export const FORMATIONS: Formation[] = [
  { def: 3, mid: 4, fwd: 3 },
  { def: 3, mid: 5, fwd: 2 },
  { def: 4, mid: 3, fwd: 3 },
  { def: 4, mid: 4, fwd: 2 },
  { def: 4, mid: 5, fwd: 1 },
  { def: 5, mid: 2, fwd: 3 },
  { def: 5, mid: 3, fwd: 2 },
  { def: 5, mid: 4, fwd: 1 },
];

/** Default rules — sourced from the squad builder so there's one rule set. */
export const DEFAULT_RULES: OptiRules = {
  budget: SQUAD_RULES.budgetTenths,
  maxPerClub: SQUAD_RULES.maxPerClub,
  positionTargets: POSITION_TARGETS,
};

/** Search tuning (all in one place). */
export const SEARCH = {
  /** Top-N value candidates per position considered for swaps. */
  candidatePoolSize: 60,
  /** Number of randomized restarts (best result kept). */
  restarts: 5,
  /** Hard wall-clock budget for the whole search, in ms. */
  timeBudgetMs: 1500,
  /** Tiny weight on bench value to break ties between equal starting XIs. */
  benchWeight: 0.001,
} as const;

export const POSITION_IDS = [1, 2, 3, 4] as const;

export const POSITION_NAME: Record<number, string> = {
  1: "Goalkeeper",
  2: "Defender",
  3: "Midfielder",
  4: "Forward",
};
