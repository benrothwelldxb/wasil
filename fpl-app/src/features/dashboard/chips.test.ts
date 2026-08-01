import { describe, expect, it } from "vitest";
import type { GameweekOutlook } from "@/features/fixtures";
import type { PlayerPrediction } from "@/features/predictions";
import { makePlayer } from "@/test/factories";
import {
  evaluateChips,
  upcomingChipTargets,
  type ChipInput,
} from "./chips";

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

function gw(
  event: number,
  blankTeams: number,
  doubleTeams: number,
): GameweekOutlook {
  return { event, blankTeams, doubleTeams, playingTeams: 20 - blankTeams };
}

describe("upcomingChipTargets", () => {
  it("flags the biggest upcoming double gameweek", () => {
    const calendar = [gw(28, 0, 5), gw(30, 0, 8), gw(32, 0, 6)];
    const out = upcomingChipTargets(calendar, 27);
    const dbl = out.find((o) => o.chips.includes("triple-captain"));
    expect(dbl?.event).toBe(30); // 8 doubles beats 5 and 6
    expect(dbl?.text).toMatch(/8 clubs play twice/);
  });

  it("flags the biggest upcoming blank gameweek", () => {
    const calendar = [gw(29, 9, 0), gw(33, 4, 0)];
    const out = upcomingChipTargets(calendar, 27);
    const blank = out.find((o) => o.chips.includes("free-hit"));
    expect(blank?.event).toBe(29);
    expect(blank?.text).toMatch(/9 clubs blank/);
  });

  it("ignores gameweeks at or before the current one", () => {
    const calendar = [gw(20, 8, 8), gw(21, 8, 8)];
    // Current GW is 21, so only later GWs count → nothing ahead.
    expect(upcomingChipTargets(calendar, 21)).toHaveLength(0);
  });

  it("ignores gameweeks beyond the planning horizon", () => {
    const calendar = [gw(40, 10, 10)]; // 13 GWs away, horizon is 8
    expect(upcomingChipTargets(calendar, 27)).toHaveLength(0);
  });

  it("ignores minor blanks/doubles below the notable threshold", () => {
    const calendar = [gw(29, 2, 3)]; // below notable (4)
    expect(upcomingChipTargets(calendar, 27)).toHaveLength(0);
  });
});
