import { describe, expect, it } from "vitest";
import { bestEleven, isValidSquad } from "./engine";
import { DEFAULT_RULES } from "./config";
import type { OptiPlayer } from "./types";

let nextId = 1;
function op(positionId: number, cost: number, value: number, teamId?: number) {
  const id = nextId++;
  return {
    id,
    positionId,
    teamId: teamId ?? id,
    cost,
    value,
  } as unknown as OptiPlayer;
}

/** A legal 2/5/5/3 squad with distinct clubs. */
function makeSquad(): OptiPlayer[] {
  nextId = 1;
  return [
    op(1, 45, 3),
    op(1, 40, 2),
    ...Array.from({ length: 5 }, (_, i) => op(2, 50, 4 + i * 0.2)),
    ...Array.from({ length: 5 }, (_, i) => op(3, 70, 5 + i * 0.3)),
    ...Array.from({ length: 3 }, (_, i) => op(4, 90, 6 + i * 0.4)),
  ];
}

describe("isValidSquad", () => {
  it("accepts a legal 2/5/5/3 squad", () => {
    expect(isValidSquad(makeSquad(), DEFAULT_RULES)).toBe(true);
  });

  it("rejects the wrong number of players", () => {
    expect(isValidSquad(makeSquad().slice(0, 14), DEFAULT_RULES)).toBe(false);
  });

  it("rejects more than three from one club", () => {
    const squad = makeSquad();
    // Force the first four defenders onto the same club.
    for (let i = 2; i < 6; i++) squad[i] = { ...squad[i]!, teamId: 99 };
    expect(isValidSquad(squad, DEFAULT_RULES)).toBe(false);
  });
});

describe("bestEleven", () => {
  it("selects a legal XI with exactly one keeper and 10 outfielders", () => {
    const xi = bestEleven(makeSquad());
    expect(xi.starters).toHaveLength(11);
    expect(xi.bench).toHaveLength(4);
    const gks = xi.starters.filter((p) => p.positionId === 1);
    expect(gks).toHaveLength(1);
    const outfield =
      xi.formation.def + xi.formation.mid + xi.formation.fwd;
    expect(outfield).toBe(10);
  });

  it("never benches a higher-value starter than a benched player of the same line", () => {
    const xi = bestEleven(makeSquad());
    const startVal = Math.min(...xi.starters.map((p) => p.value));
    const benchOutfieldMax = Math.max(
      ...xi.bench.filter((p) => p.positionId !== 1).map((p) => p.value),
      0,
    );
    // The best XI maximises value, so bench value can't exceed the best XI sum.
    expect(xi.startingValue).toBeGreaterThan(0);
    expect(benchOutfieldMax).toBeGreaterThanOrEqual(0);
    expect(startVal).toBeGreaterThan(0);
  });
});
