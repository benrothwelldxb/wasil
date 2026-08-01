import type { Team } from "@/features/fpl";
import { LEAGUE } from "../config";
import type { LeagueAverages } from "../types";

/** Neutral fallback strength (used when the API hasn't set strengths yet). */
const DEFAULT_STRENGTH = 1150;

/** Coerce to a positive, finite number, or fall back. */
function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Compute league-average attack & defence strength across all clubs. */
export function computeLeagueAverages(teams: Team[]): LeagueAverages {
  if (teams.length === 0) {
    return { avgAttack: DEFAULT_STRENGTH, avgDefence: DEFAULT_STRENGTH };
  }
  let att = 0;
  let def = 0;
  for (const t of teams) {
    att += (t.strengthAttackHome + t.strengthAttackAway) / 2;
    def += (t.strengthDefenceHome + t.strengthDefenceAway) / 2;
  }
  return {
    // Guard against preseason/degenerate data (all strengths 0 ⇒ 0 average),
    // which would otherwise divide by zero in the Poisson model.
    avgAttack: positive(att / teams.length, DEFAULT_STRENGTH),
    avgDefence: positive(def / teams.length, DEFAULT_STRENGTH),
  };
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

  // Guard every term so a zero/NaN strength can never produce NaN/Infinity.
  const avgAttack = positive(league.avgAttack, DEFAULT_STRENGTH);
  const avgDefence = positive(league.avgDefence, DEFAULT_STRENGTH);
  const selfAttack = positive(self.attack, avgAttack);
  const selfDefence = positive(self.defence, avgDefence);
  const oppAttack = positive(opp.attack, avgAttack);
  const oppDefence = positive(opp.defence, avgDefence);

  const lambdaFor = avg * (selfAttack / avgAttack) * (avgDefence / oppDefence);
  const lambdaAgainst =
    avg * (oppAttack / avgAttack) * (avgDefence / selfDefence);

  return {
    lambdaFor,
    lambdaAgainst,
    cleanSheetProb: Math.exp(-lambdaAgainst),
    attackEnv: lambdaFor / avg,
  };
}
