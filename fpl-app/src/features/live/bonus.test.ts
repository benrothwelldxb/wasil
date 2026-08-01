import { describe, expect, it } from "vitest";
import type { FplFixtureRaw } from "@/features/fpl";
import { computeProvisionalBonus } from "./bonus";

/** Minimal fixture stub carrying only what the bonus math reads. */
function fx(
  over: Partial<FplFixtureRaw> & {
    bps?: { element: number; value: number }[];
  },
): FplFixtureRaw {
  const bps = over.bps ?? [];
  return {
    code: 0,
    event: 5,
    id: 1,
    kickoff_time: null,
    minutes: 0,
    started: true,
    finished: false,
    finished_provisional: false,
    provisional_start_time: false,
    team_a: 2,
    team_a_score: null,
    team_h: 1,
    team_h_score: null,
    team_a_difficulty: 3,
    team_h_difficulty: 3,
    stats: [{ identifier: "bps", h: bps, a: [] }],
    pulse_id: 0,
    ...over,
  } as FplFixtureRaw;
}

describe("computeProvisionalBonus", () => {
  it("awards 3/2/1 to the top three bps", () => {
    const bonus = computeProvisionalBonus(
      [
        fx({
          bps: [
            { element: 10, value: 40 },
            { element: 11, value: 30 },
            { element: 12, value: 20 },
            { element: 13, value: 10 },
          ],
        }),
      ],
      5,
    );
    expect(bonus.get(10)).toBe(3);
    expect(bonus.get(11)).toBe(2);
    expect(bonus.get(12)).toBe(1);
    expect(bonus.get(13)).toBeUndefined();
  });

  it("shares the higher award on a tie (two tie for top → 3,3 then 2)", () => {
    const bonus = computeProvisionalBonus(
      [
        fx({
          bps: [
            { element: 10, value: 40 },
            { element: 11, value: 40 },
            { element: 12, value: 25 },
          ],
        }),
      ],
      5,
    );
    expect(bonus.get(10)).toBe(3);
    expect(bonus.get(11)).toBe(3);
    expect(bonus.get(12)).toBe(2);
  });

  it("ignores finished fixtures (bonus already in live points)", () => {
    const bonus = computeProvisionalBonus(
      [fx({ finished: true, bps: [{ element: 10, value: 40 }] })],
      5,
    );
    expect(bonus.size).toBe(0);
  });

  it("ignores fixtures from other gameweeks and those not started", () => {
    const bonus = computeProvisionalBonus(
      [
        fx({ event: 6, bps: [{ element: 10, value: 40 }] }),
        fx({ started: false, bps: [{ element: 11, value: 40 }] }),
      ],
      5,
    );
    expect(bonus.size).toBe(0);
  });
});
