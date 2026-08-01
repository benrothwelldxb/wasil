import { describe, expect, it } from "vitest";
import { autoPickLineup, isLegalEleven } from "./autopick";
import type { LitePlayer } from "./types";

function makeSquad(): LitePlayer[] {
  let id = 1;
  const p = (positionId: number, value: number): LitePlayer => ({
    id: id++,
    positionId,
    value,
  });
  return [
    p(1, 3.0),
    p(1, 2.5),
    ...Array.from({ length: 5 }, (_, i) => p(2, 3.5 + i * 0.2)),
    ...Array.from({ length: 5 }, (_, i) => p(3, 4.0 + i * 0.3)),
    ...Array.from({ length: 3 }, (_, i) => p(4, 5.0 + i * 0.4)),
  ];
}

describe("autoPickLineup", () => {
  it("produces a legal XI, ordered bench, and captain/vice", () => {
    const squad = makeSquad();
    const byId = new Map(squad.map((p) => [p.id, p]));
    const lineup = autoPickLineup(squad);

    const starters = lineup.starterIds.map((id) => byId.get(id)!);
    expect(starters).toHaveLength(11);
    expect(isLegalEleven(starters)).toBe(true);

    // Bench outfield sorted by value descending.
    const benchVals = lineup.benchOutfieldIds.map((id) => byId.get(id)!.value);
    for (let i = 1; i < benchVals.length; i++) {
      expect(benchVals[i - 1]!).toBeGreaterThanOrEqual(benchVals[i]!);
    }

    // Captain is the highest-value starter; vice the second.
    const maxStart = Math.max(...starters.map((p) => p.value));
    expect(byId.get(lineup.captainId!)!.value).toBe(maxStart);
    expect(byId.get(lineup.viceId!)!.value).toBeLessThanOrEqual(maxStart);
    expect(lineup.captainId).not.toBe(lineup.viceId);
  });
});
