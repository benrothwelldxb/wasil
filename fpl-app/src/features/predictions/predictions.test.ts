import { describe, expect, it } from "vitest";
import { makePlayer, makeTeam } from "@/test/factories";
import { computeFixtureEnv, computeLeagueAverages } from "./model/strength";
import { computeMinutes } from "./model/minutes";
import { fixtureContributions } from "./model/contributions";

describe("Poisson strength model", () => {
  it("gives a higher clean-sheet probability against a weaker attack", () => {
    const league = computeLeagueAverages([makeTeam()]);
    const strong = { attack: 1150, defence: 1400 };
    const weakOpp = { attack: 900, defence: 1000 };
    const toughOpp = { attack: 1400, defence: 1000 };
    const easy = computeFixtureEnv(strong, weakOpp, league);
    const hard = computeFixtureEnv(strong, toughOpp, league);
    expect(easy.cleanSheetProb).toBeGreaterThan(hard.cleanSheetProb);
    expect(easy.cleanSheetProb).toBeGreaterThan(0);
    expect(easy.cleanSheetProb).toBeLessThan(1);
  });
});

describe("fixtureContributions", () => {
  it("sums exactly to the fixture expected points", () => {
    const player = makePlayer({ positionId: 3, minutes: 1800, starts: 20 });
    const league = computeLeagueAverages([makeTeam()]);
    const env = computeFixtureEnv(
      { attack: 1200, defence: 1200 },
      { attack: 1100, defence: 1100 },
      league,
    );
    const mins = computeMinutes(player, 20);
    const { contributors, expectedPoints } = fixtureContributions(
      player,
      env,
      mins,
    );
    const sum = contributors.reduce((s, c) => s + c.points, 0);
    expect(sum).toBeCloseTo(expectedPoints, 9);
    expect(expectedPoints).toBeGreaterThan(0);
  });

  it("returns ~0 expected points for an injured player", () => {
    const injured = makePlayer({
      availability: "injured",
      chanceOfPlayingNextRound: 0,
    });
    const league = computeLeagueAverages([makeTeam()]);
    const env = computeFixtureEnv(
      { attack: 1200, defence: 1200 },
      { attack: 1100, defence: 1100 },
      league,
    );
    const mins = computeMinutes(injured, 20);
    const { expectedPoints } = fixtureContributions(injured, env, mins);
    expect(expectedPoints).toBeCloseTo(0, 6);
  });
});
