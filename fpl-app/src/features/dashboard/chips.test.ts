import { describe, expect, it } from "vitest";
import type { PlayerPrediction } from "@/features/predictions";
import { makePlayer } from "@/test/factories";
import { evaluateChips, type ChipInput } from "./chips";

/**
 * Minimal prediction stub: chip logic only reads `windows[1].expectedPoints`
 * and `windows[1].fixtureCount`, so we fill just those.
 */
function pred(points: number, fixtureCount = 1): PlayerPrediction {
  return {
    windows: { 1: { expectedPoints: points, fixtureCount } },
  } as unknown as PlayerPrediction;
}

function baseInput(over: Partial<ChipInput> = {}): ChipInput {
  const squad = Array.from({ length: 15 }, (_, i) =>
    makePlayer({ id: i + 1 }),
  );
  const byId = new Map<number, PlayerPrediction>(
    squad.map((p) => [p.id, pred(1.5, 1)]),
  );
  return {
    squad,
    starterIds: squad.slice(0, 11).map((p) => p.id),
    benchIds: squad.slice(11).map((p) => p.id),
    captainId: 1,
    predictionById: byId,
    window: 1,
    source: "yours",
    ...over,
  };
}

describe("evaluateChips", () => {
  it("holds all chips on an unremarkable week", () => {
    const advice = evaluateChips(baseInput());
    // Captain projects 2 pts, weak bench, no blanks, nobody injured.
    expect(advice).toHaveLength(0);
  });

  it("flags Triple Captain when the captain projects a huge week", () => {
    const input = baseInput();
    input.predictionById.set(1, pred(15, 2)); // double gameweek haul
    const advice = evaluateChips(input);
    const tc = advice.find((a) => a.chip === "triple-captain");
    expect(tc?.status).toBe("play");
    expect(tc?.extraPoints).toBeCloseTo(15);
    expect(tc?.reason).toMatch(/twice/);
  });

  it("flags Bench Boost when the bench projects big", () => {
    const input = baseInput();
    // 4 bench players (ids 12–15) projecting ~4 each = 16.
    for (const id of [12, 13, 14, 15]) input.predictionById.set(id, pred(4));
    const advice = evaluateChips(input);
    const bb = advice.find((a) => a.chip === "bench-boost");
    expect(bb?.status).toBe("play");
    expect(bb?.extraPoints).toBeCloseTo(16);
  });

  it("flags Free Hit in a heavy blank week and suppresses Wildcard", () => {
    const input = baseInput();
    // 8 clubs blank (fixtureCount 0) → Free Hit "play".
    for (let id = 1; id <= 8; id++) input.predictionById.set(id, pred(0, 0));
    // Also make some injured so Wildcard would otherwise fire.
    input.squad = input.squad.map((p, i) =>
      i < 5 ? { ...p, availability: "injured" as const } : p,
    );
    const advice = evaluateChips(input);
    expect(advice.find((a) => a.chip === "free-hit")?.status).toBe("play");
    expect(advice.find((a) => a.chip === "wildcard")).toBeUndefined();
  });

  it("does not flag a mass blank during preseason (no fixtures at all)", () => {
    const input = baseInput();
    for (const p of input.squad) input.predictionById.set(p.id, pred(0, 0));
    const advice = evaluateChips(input);
    expect(advice.find((a) => a.chip === "free-hit")).toBeUndefined();
  });

  it("suggests Wildcard when several players are injured or suspended", () => {
    const input = baseInput();
    input.squad = input.squad.map((p, i) =>
      i < 4 ? { ...p, availability: "injured" as const } : p,
    );
    const advice = evaluateChips(input);
    expect(advice.find((a) => a.chip === "wildcard")?.status).toBe("consider");
  });

  it("only surfaces captain/bench chips for a suggested team", () => {
    const input = baseInput({ source: "suggested" });
    input.predictionById.set(1, pred(15, 2));
    input.squad = input.squad.map((p, i) =>
      i < 4 ? { ...p, availability: "injured" as const } : p,
    );
    const advice = evaluateChips(input);
    expect(advice.find((a) => a.chip === "triple-captain")).toBeDefined();
    expect(advice.find((a) => a.chip === "wildcard")).toBeUndefined();
  });
});
