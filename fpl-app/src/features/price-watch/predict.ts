import type { Player } from "@/features/fpl";

export type PriceDirection = "rise" | "fall" | "stable";
export type PriceLikelihood = "high" | "medium" | "low";

export interface PricePrediction {
  player: Player;
  /** Net transfers this gameweek (in − out). */
  netTransfers: number;
  /** Net transfers as a share of all managers — the momentum signal. */
  momentum: number;
  direction: PriceDirection;
  likelihood: PriceLikelihood;
}

export interface PriceWatch {
  risers: PricePrediction[];
  fallers: PricePrediction[];
}

/**
 * Momentum thresholds as a share of total managers. FPL's real price-change
 * threshold is undocumented and dynamic, so this is a transparent *estimate* of
 * pressure from net transfers — not a guaranteed change.
 */
const THRESHOLD = { high: 0.012, medium: 0.006, low: 0.0025 } as const;

function likelihoodOf(momentum: number): PriceLikelihood | null {
  const m = Math.abs(momentum);
  if (m >= THRESHOLD.high) return "high";
  if (m >= THRESHOLD.medium) return "medium";
  if (m >= THRESHOLD.low) return "low";
  return null;
}

/**
 * Rank players by transfer momentum into likely risers and fallers. Pure and
 * inspectable — the score is net transfers ÷ total managers, bucketed.
 */
export function priceWatch(
  players: Player[],
  totalPlayers: number,
  limit = 15,
): PriceWatch {
  const denom = Math.max(1, totalPlayers);
  const predictions: PricePrediction[] = [];

  for (const player of players) {
    const netTransfers = player.transfersInEvent - player.transfersOutEvent;
    const momentum = netTransfers / denom;
    const likelihood = likelihoodOf(momentum);
    if (!likelihood) continue;
    predictions.push({
      player,
      netTransfers,
      momentum,
      direction: netTransfers > 0 ? "rise" : "fall",
      likelihood,
    });
  }

  const risers = predictions
    .filter((p) => p.direction === "rise")
    .sort((a, b) => b.netTransfers - a.netTransfers)
    .slice(0, limit);
  const fallers = predictions
    .filter((p) => p.direction === "fall")
    .sort((a, b) => a.netTransfers - b.netTransfers)
    .slice(0, limit);

  return { risers, fallers };
}
