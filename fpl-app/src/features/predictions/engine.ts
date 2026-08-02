import type { Player, Team } from "@/features/fpl";
import type { UpcomingFixture } from "@/features/fixtures";
import { WINDOWS, type PredictionWindow } from "./config";
import {
  computeConfidence,
  computeFixtureEnv,
  computeMinutes,
  fixtureContributions,
  minutesFromBaseline,
  neutralStrength,
  venueStrength,
} from "./model";
import type {
  Contributor,
  FixturePrediction,
  MinutesModel,
  PlayerPrediction,
  PredictionContext,
  PredictionEngine,
  WindowPrediction,
} from "./types";

/** Canonical contributor order for aggregated windows. */
const CONTRIBUTOR_ORDER = [
  "appearance",
  "goalThreat",
  "assistPotential",
  "cleanSheet",
  "saves",
  "goalsConceded",
  "bonus",
  "discipline",
];

const LABELS: Record<string, string> = {
  appearance: "Appearance",
  goalThreat: "Goal Threat",
  assistPotential: "Assist Potential",
  cleanSheet: "Clean Sheet Probability",
  saves: "Save Points",
  goalsConceded: "Goals Conceded",
  bonus: "Bonus Potential",
  discipline: "Discipline",
};

function predictFixture(
  player: Player,
  fixture: UpcomingFixture,
  selfTeam: Team,
  ctx: PredictionContext,
  mins: MinutesModel,
): FixturePrediction {
  const oppTeam = ctx.teamsById.get(fixture.opponentId);

  const self = venueStrength(selfTeam, fixture.isHome);
  const opp = oppTeam
    ? venueStrength(oppTeam, !fixture.isHome)
    : { attack: ctx.league.avgAttack, defence: ctx.league.avgDefence };

  const env = computeFixtureEnv(self, opp, ctx.league);
  const { contributors, expectedPoints } = fixtureContributions(
    player,
    env,
    mins,
  );

  // ── Single-factor counterfactual impacts (display only; not summed) ──
  // Home/away: recompute with venue-neutral strengths for both clubs.
  const neutralEnv = computeFixtureEnv(
    neutralStrength(selfTeam),
    oppTeam
      ? neutralStrength(oppTeam)
      : { attack: ctx.league.avgAttack, defence: ctx.league.avgDefence },
    ctx.league,
  );
  const homeImpact =
    expectedPoints - fixtureContributions(player, neutralEnv, mins).expectedPoints;

  // Opponent: recompute against a league-average opponent (same venue).
  const avgOppEnv = computeFixtureEnv(
    self,
    { attack: ctx.league.avgAttack, defence: ctx.league.avgDefence },
    ctx.league,
  );
  const opponentImpact =
    expectedPoints - fixtureContributions(player, avgOppEnv, mins).expectedPoints;

  // Rotation: recompute at full availability (no rotation/injury discount).
  const fullMins = minutesFromBaseline(mins.baselineMinsPerGame, mins.startRate, 1);
  const rotationImpact =
    expectedPoints - fixtureContributions(player, env, fullMins).expectedPoints;

  return {
    fixtureId: fixture.fixtureId,
    event: fixture.event,
    isHome: fixture.isHome,
    opponentShort: fixture.opponentShort,
    opponentName: fixture.opponentName,
    difficulty: fixture.difficulty,
    expectedPoints,
    contributors,
    factors: {
      attackEnv: env.attackEnv,
      cleanSheetProb: env.cleanSheetProb,
      lambdaFor: env.lambdaFor,
      lambdaAgainst: env.lambdaAgainst,
      homeImpact,
      opponentImpact,
      rotationImpact,
    },
  };
}

function aggregateWindow(
  window: PredictionWindow,
  fixtures: FixturePrediction[],
  upcomingGameweeks: number[],
  player: Player,
  mins: MinutesModel,
): WindowPrediction {
  const gameweeks = upcomingGameweeks.slice(0, window);
  const gwSet = new Set(gameweeks);
  const inWindow = fixtures.filter(
    (f) => f.event !== null && gwSet.has(f.event),
  );

  const totals = new Map<string, number>();
  for (const key of CONTRIBUTOR_ORDER) totals.set(key, 0);
  for (const f of inWindow) {
    for (const c of f.contributors) {
      totals.set(c.key, (totals.get(c.key) ?? 0) + c.points);
    }
  }

  const contributors: Contributor[] = CONTRIBUTOR_ORDER.map((key) => ({
    key,
    label: LABELS[key] ?? key,
    points: totals.get(key) ?? 0,
  }));

  const expectedPoints = inWindow.reduce((s, f) => s + f.expectedPoints, 0);

  return {
    window,
    gameweeks,
    fixtureCount: inWindow.length,
    expectedPoints,
    contributors,
    confidence: computeConfidence(player, mins, window),
  };
}

/**
 * The default statistical prediction engine (no AI). Implements
 * {@link PredictionEngine} so it can be swapped for an ML engine later without
 * touching consumers.
 */
export class StatisticalPredictionEngine implements PredictionEngine {
  readonly id = "statistical-v1";

  predictPlayer(player: Player, ctx: PredictionContext): PlayerPrediction {
    const mins = computeMinutes(player, ctx.gamesPlayed);
    const selfTeam = ctx.teamsById.get(player.teamId);
    const upcoming = ctx.fixtures.get(player.teamId)?.fixtures ?? [];

    const fixtures: FixturePrediction[] = selfTeam
      ? upcoming.map((fx) => predictFixture(player, fx, selfTeam, ctx, mins))
      : [];

    const windows = {} as Record<PredictionWindow, WindowPrediction>;
    for (const window of WINDOWS) {
      windows[window] = aggregateWindow(
        window,
        fixtures,
        ctx.upcomingGameweeks,
        player,
        mins,
      );
    }

    // Early-season fallback: with no minutes played yet (preseason / GW1) the
    // stats model has no signal, so lean on FPL's own next-GW expected points
    // (which already reflect their injury/availability knowledge), still scaled
    // by our availability factor so flagged-out players stay at zero.
    if (mins.baselineMinsPerGame === 0 && player.epNext && player.epNext > 0) {
      for (const window of WINDOWS) {
        const w = windows[window];
        const games = w.fixtureCount > 0 ? w.fixtureCount : window;
        const value = player.epNext * games * mins.availability;
        windows[window] = {
          ...w,
          expectedPoints: value,
          contributors: [
            { key: "fpl-ep", label: "FPL early-season projection", points: value },
          ],
          confidence: 30,
        };
      }
    }

    return { playerId: player.id, player, minutes: mins, fixtures, windows };
  }

  predictAll(players: Player[], ctx: PredictionContext): PlayerPrediction[] {
    return players.map((p) => this.predictPlayer(p, ctx));
  }
}

/** Shared singleton engine instance. */
export const predictionEngine: PredictionEngine =
  new StatisticalPredictionEngine();
