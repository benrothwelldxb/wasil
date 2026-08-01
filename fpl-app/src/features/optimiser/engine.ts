import { FORMATIONS, POSITION_IDS, SEARCH } from "./config";
import { buildReasons } from "./reasons";
import type {
  BestEleven,
  Formation,
  OptiPlayer,
  OptiRules,
  OptimisedSquad,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────

function byPosition(players: OptiPlayer[]): Map<number, OptiPlayer[]> {
  const map = new Map<number, OptiPlayer[]>();
  for (const id of POSITION_IDS) map.set(id, []);
  for (const p of players) map.get(p.positionId)?.push(p);
  return map;
}

function totalCost(squad: OptiPlayer[]): number {
  return squad.reduce((sum, p) => sum + p.cost, 0);
}

function clubCounts(squad: OptiPlayer[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of squad) m.set(p.teamId, (m.get(p.teamId) ?? 0) + 1);
  return m;
}

/**
 * Extract the highest-scoring legal starting XI from a 15-man squad by trying
 * every formation and taking the top players per line. O(formations) — cheap.
 */
/** Selection score: preference-adjusted objective, defaulting to raw value. */
function scoreOf(p: OptiPlayer): number {
  return p.objective ?? p.value;
}

export function bestEleven(
  squad: OptiPlayer[],
  forced?: Formation,
): BestEleven {
  const pos = byPosition(squad);
  // Rank by the selection score so preferences drive who starts...
  const gks = [...(pos.get(1) ?? [])].sort((a, b) => scoreOf(b) - scoreOf(a));
  const defs = [...(pos.get(2) ?? [])].sort((a, b) => scoreOf(b) - scoreOf(a));
  const mids = [...(pos.get(3) ?? [])].sort((a, b) => scoreOf(b) - scoreOf(a));
  const fwds = [...(pos.get(4) ?? [])].sort((a, b) => scoreOf(b) - scoreOf(a));

  const gk = gks[0];
  const formations = forced ? [forced] : FORMATIONS;

  let best: BestEleven | null = null;
  for (const f of formations) {
    if (defs.length < f.def || mids.length < f.mid || fwds.length < f.fwd) {
      continue;
    }
    const starters = [
      ...(gk ? [gk] : []),
      ...defs.slice(0, f.def),
      ...mids.slice(0, f.mid),
      ...fwds.slice(0, f.fwd),
    ];
    // ...but choose the best formation by objective, and report raw points.
    const startingObjective = starters.reduce((s, p) => s + scoreOf(p), 0);
    if (!best || startingObjective > best.startingObjective) {
      const starterIds = new Set(starters.map((p) => p.id));
      const bench = squad.filter((p) => !starterIds.has(p.id));
      best = {
        formation: f,
        starters,
        bench,
        startingValue: starters.reduce((s, p) => s + p.value, 0),
        benchValue: bench.reduce((s, p) => s + p.value, 0),
        startingObjective,
        benchObjective: bench.reduce((s, p) => s + scoreOf(p), 0),
      };
    }
  }

  // Fallback (degenerate squad) — should not happen for a valid 15.
  return (
    best ?? {
      formation: { def: 4, mid: 4, fwd: 2 },
      starters: squad.slice(0, 11),
      bench: squad.slice(11),
      startingValue: 0,
      benchValue: 0,
      startingObjective: 0,
      benchObjective: 0,
    }
  );
}

function objective(squad: OptiPlayer[]): number {
  const xi = bestEleven(squad);
  return xi.startingObjective + SEARCH.benchWeight * xi.benchObjective;
}

// ── Construction & search ───────────────────────────────────────────────────

/** Feasible seed: the cheapest players per position (respecting club cap). */
function cheapestSeed(
  pools: Map<number, OptiPlayer[]>,
  rules: OptiRules,
  jitter: number,
): OptiPlayer[] | null {
  const squad: OptiPlayer[] = [];
  const clubs = new Map<number, number>();

  for (const posId of POSITION_IDS) {
    const target = rules.positionTargets[posId] ?? 0;
    // Consider a slightly wider cheap band and pick randomly within it, so
    // restarts explore different feasible seeds.
    const sorted = [...(pools.get(posId) ?? [])].sort(
      (a, b) => a.cost - b.cost,
    );
    const band = sorted.slice(0, Math.min(sorted.length, target + jitter));
    // Shuffle the band deterministically-ish by value to vary seeds.
    band.sort((a, b) =>
      jitter === 0 ? a.cost - b.cost : scoreOf(b) - scoreOf(a) + (a.id % 3) - 1,
    );

    let taken = 0;
    for (const p of band.concat(sorted)) {
      if (taken >= target) break;
      if (squad.some((s) => s.id === p.id)) continue;
      if ((clubs.get(p.teamId) ?? 0) >= rules.maxPerClub) continue;
      squad.push(p);
      clubs.set(p.teamId, (clubs.get(p.teamId) ?? 0) + 1);
      taken++;
    }
    if (taken < target) return null; // not enough players
  }
  return squad;
}

/** Best-improvement local search: upgrade one player per step. */
function localSearch(
  seed: OptiPlayer[],
  candidates: Map<number, OptiPlayer[]>,
  rules: OptiRules,
  deadline: number,
): { squad: OptiPlayer[]; objective: number } {
  let current = seed;
  let curObj = objective(current);

  for (;;) {
    if (performance.now() > deadline) break;

    const inSquad = new Set(current.map((p) => p.id));
    const clubs = clubCounts(current);
    const cost = totalCost(current);

    let bestObj = curObj;
    let bestSwap: { index: number; player: OptiPlayer } | null = null;

    for (let i = 0; i < current.length; i++) {
      const out = current[i];
      if (!out) continue;
      const pool = candidates.get(out.positionId) ?? [];
      for (const inc of pool) {
        if (inSquad.has(inc.id)) continue;
        // Budget feasibility.
        if (cost - out.cost + inc.cost > rules.budget) continue;
        // Club feasibility: adding `inc` (different club) mustn't exceed cap.
        if (
          inc.teamId !== out.teamId &&
          (clubs.get(inc.teamId) ?? 0) >= rules.maxPerClub
        ) {
          continue;
        }
        const next = current.slice();
        next[i] = inc;
        const obj = objective(next);
        if (obj > bestObj + 1e-9) {
          bestObj = obj;
          bestSwap = { index: i, player: inc };
        }
      }
    }

    if (!bestSwap) break; // local optimum
    current = current.slice();
    current[bestSwap.index] = bestSwap.player;
    curObj = bestObj;
  }

  return { squad: current, objective: curObj };
}

/** Validate a squad against every FPL constraint. */
export function isValidSquad(squad: OptiPlayer[], rules: OptiRules): boolean {
  if (squad.length !== 15) return false;
  if (new Set(squad.map((p) => p.id)).size !== 15) return false;
  if (totalCost(squad) > rules.budget) return false;
  for (const [, count] of clubCounts(squad)) {
    if (count > rules.maxPerClub) return false;
  }
  const pos = byPosition(squad);
  for (const id of POSITION_IDS) {
    if ((pos.get(id)?.length ?? 0) !== (rules.positionTargets[id] ?? 0)) {
      return false;
    }
  }
  return true;
}

export interface OptimiseOptions {
  rules?: OptiRules;
  /** Force a specific formation for the XI (default: best of all). */
  formation?: Formation;
  /** Horizon (gameweeks) — for the explanations. */
  window?: number;
}

/**
 * Find the mathematically highest-scoring legal 15-man squad.
 *
 * Strategy: seed with the cheapest feasible squad (maximising spare budget),
 * then run best-improvement local search over top-value candidates per
 * position — each accepted swap strictly increases the projected starting XI
 * while never breaking budget, club, or position limits. Multiple randomized
 * restarts within a wall-clock budget keep the result near-optimal, in well
 * under the few-second target.
 */
export function optimiseSquad(
  players: OptiPlayer[],
  options: OptimiseOptions = {},
): OptimisedSquad | null {
  const rules = options.rules ?? {
    budget: 1000,
    maxPerClub: 3,
    positionTargets: { 1: 2, 2: 5, 3: 5, 4: 3 },
  };
  const window = options.window ?? 5;

  const start = performance.now();
  const pools = byPosition(players);

  // Candidate pools for swaps: top-value per position.
  const candidates = new Map<number, OptiPlayer[]>();
  for (const id of POSITION_IDS) {
    candidates.set(
      id,
      [...(pools.get(id) ?? [])]
        .sort((a, b) => scoreOf(b) - scoreOf(a))
        .slice(0, SEARCH.candidatePoolSize),
    );
  }

  const deadline = start + SEARCH.timeBudgetMs;
  let best: { squad: OptiPlayer[]; objective: number } | null = null;

  for (let r = 0; r < SEARCH.restarts; r++) {
    if (performance.now() > deadline) break;
    const seed = cheapestSeed(pools, rules, r === 0 ? 0 : 2 + r);
    if (!seed) return null;
    const restartDeadline = Math.min(
      deadline,
      performance.now() + SEARCH.timeBudgetMs / SEARCH.restarts,
    );
    const result = localSearch(seed, candidates, rules, restartDeadline);
    if (!best || result.objective > best.objective) best = result;
  }

  if (!best) return null;

  const squad = best.squad;
  const xi = bestEleven(squad, options.formation);
  const cost = totalCost(squad);

  return {
    squad,
    best: xi,
    reasons: buildReasons(squad, xi, players, window),
    totalProjected: xi.startingValue,
    cost,
    remaining: rules.budget - cost,
    valid: isValidSquad(squad, rules),
    objective: best.objective,
    elapsedMs: Math.round(performance.now() - start),
  };
}
