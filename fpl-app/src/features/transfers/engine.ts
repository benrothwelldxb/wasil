import { autoPickLineup, projectLineup } from "@/features/lineup";
import { DEFAULT_RULES, optimiseSquad } from "@/features/optimiser";
import { TRANSFER_HIT_COST } from "./store";
import type { TransferMove, TransferPlayer } from "./types";

const MAX_PER_CLUB = 3;

/** Best-XI + captain projected score for a 15-man squad. */
export function lineupTotal(squad: TransferPlayer[]): number {
  const lite = squad.map((p) => ({
    id: p.id,
    positionId: p.positionId,
    value: p.value,
  }));
  const lineup = autoPickLineup(lite);
  const byId = new Map(lite.map((p) => [p.id, p]));
  return projectLineup(lineup, byId).total;
}

function clubCounts(squad: TransferPlayer[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of squad) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
  return m;
}

function withinClubLimit(squad: TransferPlayer[]): boolean {
  for (const [, n] of clubCounts(squad)) if (n > MAX_PER_CLUB) return false;
  return true;
}

function hitFor(transfers: number, freeTransfers: number): number {
  return Math.max(0, transfers - freeTransfers) * TRANSFER_HIT_COST;
}

function horizonLabel(window: number): string {
  return window === 1 ? "the next GW" : `the next ${window} GWs`;
}

/** The incoming player's biggest projected-points driver, for explanations. */
function topDriver(p: TransferPlayer, window: number): string | null {
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

function moveReason(
  out: TransferPlayer,
  inc: TransferPlayer,
  window: number,
): string {
  const driver = topDriver(inc, window);
  return (
    `OUT ${out.player.webName} (${out.value.toFixed(1)}) → IN ` +
    `${inc.player.webName} (${inc.value.toFixed(1)}): ` +
    `+${(inc.value - out.value).toFixed(1)} projected over ${horizonLabel(window)}` +
    (driver ? `, driven by ${driver}.` : ".")
  );
}

interface Market {
  /** Candidate incomings per position, sorted by value desc. */
  byPosition: Map<number, TransferPlayer[]>;
}

function buildMarket(
  market: TransferPlayer[],
  currentIds: Set<number>,
  poolSize: number,
): Market {
  const byPosition = new Map<number, TransferPlayer[]>();
  for (const id of [1, 2, 3, 4]) {
    byPosition.set(
      id,
      market
        .filter((p) => p.positionId === id && !currentIds.has(p.id))
        .sort((a, b) => b.value - a.value)
        .slice(0, poolSize),
    );
  }
  return { byPosition };
}

// ── Single transfer ─────────────────────────────────────────────────────────

/** The single transfer that most improves the projected score. */
export function bestSingle(
  current: TransferPlayer[],
  market: TransferPlayer[],
  bank: number,
  freeTransfers: number,
  window: number,
): TransferMove | null {
  const currentIds = new Set(current.map((p) => p.id));
  const m = buildMarket(market, currentIds, 40);
  const clubs = clubCounts(current);
  const baseline = lineupTotal(current);

  let best: { out: TransferPlayer; inc: TransferPlayer; gain: number } | null =
    null;

  for (const out of current) {
    for (const inc of m.byPosition.get(out.positionId) ?? []) {
      if (inc.cost > bank + out.cost) continue; // affordability
      if (
        inc.teamId !== out.teamId &&
        (clubs.get(inc.teamId) ?? 0) >= MAX_PER_CLUB
      ) {
        continue;
      }
      const next = current.map((p) => (p.id === out.id ? inc : p));
      const gain = lineupTotal(next) - baseline;
      if (gain > (best?.gain ?? 0) + 1e-9) best = { out, inc, gain };
    }
  }

  if (!best) return null;
  const hit = hitFor(1, freeTransfers);
  return {
    out: [best.out],
    in: [best.inc],
    gain: best.gain,
    transfers: 1,
    hit,
    net: best.gain - hit,
    moneyRemaining: bank + best.out.cost - best.inc.cost,
    reasons: [moveReason(best.out, best.inc, window)],
  };
}

// ── Double transfer ─────────────────────────────────────────────────────────

interface Swap {
  out: TransferPlayer;
  inc: TransferPlayer;
  delta: number; // value delta, for ranking
}

/** The best pair of transfers (evaluated jointly). */
export function bestDouble(
  current: TransferPlayer[],
  market: TransferPlayer[],
  bank: number,
  freeTransfers: number,
  window: number,
): TransferMove | null {
  const currentIds = new Set(current.map((p) => p.id));
  const m = buildMarket(market, currentIds, 8);
  const baseline = lineupTotal(current);

  // Candidate single swaps, ranked by value uplift (budget-permitting with
  // slack, since the paired swap may free funds).
  const swaps: Swap[] = [];
  for (const out of current) {
    for (const inc of m.byPosition.get(out.positionId) ?? []) {
      if (inc.cost > bank + out.cost + 30) continue; // £3.0m slack
      swaps.push({ out, inc, delta: inc.value - out.value });
    }
  }
  swaps.sort((a, b) => b.delta - a.delta);
  const pool = swaps.slice(0, 60);

  let best: { a: Swap; b: Swap; gain: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]!;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j]!;
      if (a.out.id === b.out.id || a.inc.id === b.inc.id) continue;
      // Combined budget.
      if (a.inc.cost + b.inc.cost > bank + a.out.cost + b.out.cost) continue;
      const next = current
        .filter((p) => p.id !== a.out.id && p.id !== b.out.id)
        .concat(a.inc, b.inc);
      if (!withinClubLimit(next)) continue;
      const gain = lineupTotal(next) - baseline;
      if (gain > (best?.gain ?? 0) + 1e-9) best = { a, b, gain };
    }
  }

  if (!best) return null;
  const hit = hitFor(2, freeTransfers);
  return {
    out: [best.a.out, best.b.out],
    in: [best.a.inc, best.b.inc],
    gain: best.gain,
    transfers: 2,
    hit,
    net: best.gain - hit,
    moneyRemaining:
      bank +
      best.a.out.cost +
      best.b.out.cost -
      best.a.inc.cost -
      best.b.inc.cost,
    reasons: [
      moveReason(best.a.out, best.a.inc, window),
      moveReason(best.b.out, best.b.inc, window),
    ],
  };
}

// ── Wildcard ────────────────────────────────────────────────────────────────

/** The best full-squad rebuild (wildcard = unlimited free transfers). */
export function bestWildcard(
  current: TransferPlayer[],
  market: TransferPlayer[],
  bank: number,
  window: number,
): TransferMove | null {
  const squadValue = current.reduce((s, p) => s + p.cost, 0);
  const budget = squadValue + bank;

  const result = optimiseSquad(market, {
    rules: { ...DEFAULT_RULES, budget },
    window,
  });
  if (!result) return null;

  const currentIds = new Set(current.map((p) => p.id));
  const newIds = new Set(result.squad.map((p) => p.id));
  const out = current.filter((p) => !newIds.has(p.id));
  const incoming = result.squad.filter((p) => !currentIds.has(p.id));

  const gain = lineupTotal(result.squad) - lineupTotal(current);

  return {
    out,
    in: incoming,
    gain,
    transfers: out.length,
    hit: 0, // wildcard is free
    net: gain,
    moneyRemaining: budget - result.cost,
    formation: result.best.formation,
    reasons: [
      `${out.length} change${out.length === 1 ? "" : "s"} for +${gain.toFixed(1)} ` +
        `projected points over ${horizonLabel(window)} (wildcard — no point hits).`,
      ...incoming
        .slice(0, 3)
        .map((p) => {
          const driver = topDriver(p, window);
          return `IN ${p.player.webName} (${p.value.toFixed(1)} xPts)${driver ? ` — ${driver}` : ""}.`;
        }),
    ],
  };
}
