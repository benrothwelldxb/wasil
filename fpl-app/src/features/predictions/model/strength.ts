import type { Team } from "@/features/fpl";
import { LEAGUE } from "../config";
import type { LeagueAverages } from "../types";

/** Compute league-average attack & defence strength across all clubs. */
export function computeLeagueAverages(teams: Team[]): LeagueAverages {
  if (teams.length === 0) return { avgAttack: 1150, avgDefence: 1150 };
  let att = 0;
  let def = 0;
  for (const t of teams) {
    att += (t.strengthAttackHome + t.strengthAttackAway) / 2;
    def += (t.strengthDefenceHome + t.strengthDefenceAway) / 2;
  }
  return { avgAttack: att / teams.length, avgDefence: def / teams.length };
}

/** A club's attack/defence strength at a given venue. */
export function venueStrength(team: Team, isHome: boolean) {
  return {
    attack: isHome ? team.strengthAttackHome : team.strengthAttackAway,
    defence: isHome ? team.strengthDefenceHome : team.strengthDefenceAway,
  };
}

/** Venue-neutral strength (average of home & away) — for counterfactuals. */
export function neutralStrength(team: Team) {
  return {
    attack: (team.strengthAttackHome + team.strengthAttackAway) / 2,
    defence: (team.strengthDefenceHome + team.strengthDefenceAway) / 2,
  };
}

export interface FixtureEnv {
  /** Expected goals for the player's team. */
  lambdaFor: number;
  /** Expected goals against the player's team. */
  lambdaAgainst: number;
  /** P(team keeps a clean sheet) = exp(−λ_against). */
  cleanSheetProb: number;
  /** Attacking environment relative to average (λ_for / AVG_GOALS). */
  attackEnv: number;
}

/**
 * Poisson strength model for one fixture. See config.ts for the formulas.
 *
 * @param self  the player's team strength at the fixture venue
 * @param opp   the opponent's strength at the fixture venue
 */
export function computeFixtureEnv(
  self: { attack: number; defence: number },
  opp: { attack: number; defence: number },
  league: LeagueAverages,
): FixtureEnv {
  const avg = LEAGUE.avgGoalsPerTeam;
  const lambdaFor =
    avg * (self.attack / league.avgAttack) * (league.avgDefence / opp.defence);
  const lambdaAgainst =
    avg * (opp.attack / league.avgAttack) * (league.avgDefence / self.defence);

  return {
    lambdaFor,
    lambdaAgainst,
    cleanSheetProb: Math.exp(-lambdaAgainst),
    attackEnv: lambdaFor / avg,
  };
}
