import { describe, expect, it } from "vitest";
import { rateTeam } from "./rating";

describe("rateTeam", () => {
  it("grades a strong, optimised team highly with no top fix", () => {
    const r = rateTeam({
      captainRank: 1,
      benchPoints: 10,
      riskyCount: 0,
      transferGain: 0.2,
    });
    expect(r.grade).toBe("A");
    expect(r.topFix).toBeNull();
  });

  it("penalises a big available upgrade and surfaces it as the top fix", () => {
    const r = rateTeam({
      captainRank: 1,
      benchPoints: 10,
      riskyCount: 0,
      transferGain: 3,
    });
    expect(r.score).toBeLessThan(90);
    expect(r.topFix).toMatch(/transfer/i);
  });

  it("flags captaincy when the armband isn't on the best player", () => {
    const r = rateTeam({
      captainRank: 5,
      benchPoints: 6,
      riskyCount: 0,
      transferGain: 0.1,
    });
    const cap = r.checks.find((c) => c.label === "Captaincy");
    expect(cap?.status).toBe("weak");
    expect(r.topFix).toMatch(/armband/i);
  });
});
