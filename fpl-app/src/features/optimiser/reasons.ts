import { POSITION_NAME } from "./config";
import type {
  BestEleven,
  OptiPlayer,
  SelectionReason,
} from "./types";

function horizonLabel(window: number): string {
  return window === 1 ? "this week" : `the next ${window} weeks`;
}

/** Lower-case, friendlier phrasing for a points driver. */
function driverPhrase(label: string): string {
  return label.replace(/ Probability$/, "").toLowerCase();
}

/** Rank every player within its position by value (1 = best). */
function positionRanks(players: OptiPlayer[]): Map<number, number> {
  const byPos = new Map<number, OptiPlayer[]>();
  for (const p of players) {
    const list = byPos.get(p.positionId);
    if (list) list.push(p);
    else byPos.set(p.positionId, [p]);
  }
  const ranks = new Map<number, number>();
  for (const list of byPos.values()) {
    list
      .slice()
      .sort((a, b) => b.value - a.value)
      .forEach((p, i) => ranks.set(p.id, i + 1));
  }
  return ranks;
}

/** The player's strongest positive xPts contributor for the window. */
function topContributor(p: OptiPlayer, window: number): string | null {
  const win = p.prediction.windows[window as 1 | 3 | 5 | 8];
  if (!win) return null;
  let best: { label: string; points: number } | null = null;
  for (const c of win.contributors) {
    if (c.points > 0 && (!best || c.points > best.points)) {
      best = { label: c.label, points: c.points };
    }
  }
  return best?.label ?? null;
}

/**
 * Explain, for every squad player, why the optimiser selected them — their
 * position rank, projected points, value efficiency, and biggest points
 * driver (for starters), or their budget role (for bench).
 */
export function buildReasons(
  squad: OptiPlayer[],
  best: BestEleven,
  universe: OptiPlayer[],
  window: number,
): Map<number, SelectionReason> {
  const ranks = positionRanks(universe);
  const starterIds = new Set(best.starters.map((p) => p.id));
  const reasons = new Map<number, SelectionReason>();

  for (const p of squad) {
    const posName = (POSITION_NAME[p.positionId] ?? "player").toLowerCase();
    const rank = ranks.get(p.id) ?? 0;
    const price = (p.cost / 10).toFixed(1);
    const pts = Math.round(p.value);

    if (starterIds.has(p.id)) {
      const driver = topContributor(p, window);
      // Plain-language lead; the exact xPts number is available elsewhere.
      const strength =
        rank > 0 && rank <= 5
          ? `One of the best ${posName}s`
          : `A strong ${posName} for the price`;
      reasons.set(p.id, {
        playerId: p.id,
        role: "starter",
        reason:
          `${strength} — about ${pts} pts ${horizonLabel(window)} (£${price}m).` +
          (driver ? ` Best for ${driverPhrase(driver)}.` : ""),
      });
    } else {
      reasons.set(p.id, {
        playerId: p.id,
        role: "bench",
        reason: `Cheap bench pick (£${price}m) — saves money for your best XI.`,
      });
    }
  }

  return reasons;
}
