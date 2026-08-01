import type { Player } from "@/features/fpl";
import { BONUS, LEAGUE, POINTS, RATES, SET_PIECE } from "../config";
import type { Contributor, MinutesModel } from "../types";
import type { FixtureEnv } from "./strength";

/** Per-90 rate for a season total, damped for small samples. */
function per90(total: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (total * 90) / Math.max(minutes, RATES.minMinutesForRate);
}

const blend = (a: number, b: number, w: number) => w * a + (1 - w) * b;

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

/** Sanitise to a finite number so the UI never renders NaN/Infinity. */
function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function contributor(key: string, points: number): Contributor {
  return { key, label: LABELS[key] ?? key, points: safe(points) };
}

/**
 * Expected points for one fixture, decomposed into additive, signed
 * contributions that sum EXACTLY to the total (nothing hidden).
 *
 *   goalThreat = blend(xG90, goals90) × minsFactor × attackEnv × goalPts
 *   cleanSheet = P(clean sheet) × csPts × p60
 *   conceded   = −(λ_against ÷ 2) × p60   (GK/DEF)
 *   saves      = saves90 × minsFactor × (λ_against ÷ AVG_GOALS) ÷ 3   (GK)
 *
 * Set-piece duties add to xG (penalties) / xA (corners & free-kicks).
 */
export function fixtureContributions(
  player: Player,
  env: FixtureEnv,
  mins: MinutesModel,
): { contributors: Contributor[]; expectedPoints: number } {
  const pos = player.positionId;
  const goalPts = POINTS.goal[pos] ?? 4;
  const csPts = POINTS.cleanSheet[pos] ?? 0;
  const isDefensive = pos === 1 || pos === 2;
  const isKeeper = pos === 1;
  const minsFactor = mins.xMins / 90;

  // Attacking rates (xG/xA blended with actual, plus set-piece duty).
  const penaltyXg = player.penaltiesOrder === 1 ? SET_PIECE.penaltyXgPer90 : 0;
  const deadballXa =
    player.cornersOrder === 1 || player.freeKicksOrder === 1
      ? SET_PIECE.deadballXaPer90
      : 0;

  const goalRate90 = blend(
    per90(player.expectedGoals, player.minutes) + penaltyXg,
    per90(player.goalsScored, player.minutes),
    RATES.goalXgWeight,
  );
  const assistRate90 = blend(
    per90(player.expectedAssists, player.minutes) + deadballXa,
    per90(player.assists, player.minutes),
    RATES.assistXaWeight,
  );

  const eGoals = goalRate90 * minsFactor * env.attackEnv;
  const eAssists = assistRate90 * minsFactor * env.attackEnv;

  // Appearance: 1 for any minutes, +1 for ≥60.
  const appearance =
    mins.pPlay * POINTS.appearanceAny + mins.p60 * POINTS.appearance60;

  const goalThreat = eGoals * goalPts;
  const assistPotential = eAssists * POINTS.assist;
  const cleanSheet = env.cleanSheetProb * csPts * mins.p60;

  const saves = isKeeper
    ? (per90(player.saves, player.minutes) *
        minsFactor *
        (env.lambdaAgainst / LEAGUE.avgGoalsPerTeam)) /
      POINTS.savesPerPoint
    : 0;

  const goalsConceded = isDefensive
    ? POINTS.concededPenalty *
      (env.lambdaAgainst / POINTS.concededPerGoals) *
      mins.p60
    : 0;

  const attackEnvNorm = Math.min(env.attackEnv / 2, 1);
  const coupling =
    BONUS.fixtureCoupling.min +
    (BONUS.fixtureCoupling.max - BONUS.fixtureCoupling.min) * attackEnvNorm;
  const bonus = Math.min(
    per90(player.bonus, player.minutes) * minsFactor * coupling,
    BONUS.cap,
  );

  // POINTS.yellowCard / redCard are already negative, so this sums to ≤ 0.
  const disciplinePoints =
    per90(player.yellowCards, player.minutes) * minsFactor * POINTS.yellowCard +
    per90(player.redCards, player.minutes) * minsFactor * POINTS.redCard;

  const contributors: Contributor[] = [
    contributor("appearance", appearance),
    contributor("goalThreat", goalThreat),
    contributor("assistPotential", assistPotential),
    contributor("cleanSheet", cleanSheet),
    contributor("saves", saves),
    contributor("goalsConceded", goalsConceded),
    contributor("bonus", bonus),
    contributor("discipline", disciplinePoints),
  ];

  const expectedPoints = safe(
    contributors.reduce((sum, c) => sum + c.points, 0),
  );
  return { contributors, expectedPoints };
}
