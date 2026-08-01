import { FORMATIONS, type Formation } from "@/features/optimiser";
import type { Lineup, LitePlayer } from "./types";

const GK = 1;

function byPosition(players: LitePlayer[]): Record<number, LitePlayer[]> {
  const map: Record<number, LitePlayer[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of players) map[p.positionId]?.push(p);
  return map;
}

/** The formation of a given set of starters (by their position counts). */
export function formationOf(
  starters: LitePlayer[],
): Formation {
  const pos = byPosition(starters);
  return {
    def: pos[2]?.length ?? 0,
    mid: pos[3]?.length ?? 0,
    fwd: pos[4]?.length ?? 0,
  };
}

/** Whether a starter set is a legal XI (1 GK + a valid formation). */
export function isLegalEleven(starters: LitePlayer[]): boolean {
  if (starters.length !== 11) return false;
  const pos = byPosition(starters);
  if ((pos[1]?.length ?? 0) !== 1) return false;
  const f = { def: pos[2]!.length, mid: pos[3]!.length, fwd: pos[4]!.length };
  return FORMATIONS.some(
    (x) => x.def === f.def && x.mid === f.mid && x.fwd === f.fwd,
  );
}

/**
 * Auto-pick the optimal lineup from a 15-man squad:
 * - Best XI = the formation maximising starting projected points.
 * - Bench outfield ordered by projected points (best sub first).
 * - Captain = highest projected starter; Vice = second highest.
 */
export function autoPickLineup(players: LitePlayer[]): Lineup {
  const pos = byPosition(players);
  const gks = [...(pos[1] ?? [])].sort((a, b) => b.value - a.value);
  const defs = [...(pos[2] ?? [])].sort((a, b) => b.value - a.value);
  const mids = [...(pos[3] ?? [])].sort((a, b) => b.value - a.value);
  const fwds = [...(pos[4] ?? [])].sort((a, b) => b.value - a.value);

  const gk = gks[0];
  let best: { starters: LitePlayer[]; value: number } | null = null;
  for (const f of FORMATIONS) {
    if (defs.length < f.def || mids.length < f.mid || fwds.length < f.fwd) {
      continue;
    }
    const starters = [
      ...(gk ? [gk] : []),
      ...defs.slice(0, f.def),
      ...mids.slice(0, f.mid),
      ...fwds.slice(0, f.fwd),
    ];
    const value = starters.reduce((s, p) => s + p.value, 0);
    if (!best || value > best.value) best = { starters, value };
  }

  const starters = best?.starters ?? players.slice(0, 11);
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = players.filter((p) => !starterIds.has(p.id));

  const benchGk = bench.find((p) => p.positionId === GK) ?? null;
  const benchOutfield = bench
    .filter((p) => p.positionId !== GK)
    .sort((a, b) => b.value - a.value);

  const rankedStarters = [...starters].sort((a, b) => b.value - a.value);

  return {
    starterIds: starters.map((p) => p.id),
    benchGkId: benchGk?.id ?? null,
    benchOutfieldIds: benchOutfield.map((p) => p.id),
    captainId: rankedStarters[0]?.id ?? null,
    viceId: rankedStarters[1]?.id ?? null,
  };
}
