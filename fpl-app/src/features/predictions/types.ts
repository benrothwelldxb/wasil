import type { Player, Team } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";
import type { PredictionWindow } from "./config";

/** League-average strengths used to normalise the Poisson model. */
export interface LeagueAverages {
  avgAttack: number;
  avgDefence: number;
}

/**
 * Everything the engine needs, computed ONCE and shared across all players so
 * `predictAll` stays O(players × fixtures).
 */
export interface PredictionContext {
  teamsById: Map<number, Team>;
  fixtures: FixtureAnalysisMap;
  /** Distinct upcoming gameweek numbers, ascending. */
  upcomingGameweeks: number[];
  /** Gameweeks played so far (for per-game rate estimates). */
  gamesPlayed: number;
  league: LeagueAverages;
}

/** One named, signed point contribution. Contributions sum exactly to xPts. */
export interface Contributor {
  key: string;
  label: string;
  points: number;
}

/** The expected minutes / rotation model for a player. */
export interface MinutesModel {
  availability: number;
  baselineMinsPerGame: number;
  startRate: number;
  /** Expected minutes next match. */
  xMins: number;
  /** Probability of playing any minutes. */
  pPlay: number;
  /** Probability of playing ≥60 minutes. */
  p60: number;
  /** 1 − p60. */
  rotationRisk: number;
}

/** Explanatory (non-additive) fixture factors, for full transparency. */
export interface FixtureFactors {
  attackEnv: number;
  cleanSheetProb: number;
  lambdaFor: number;
  lambdaAgainst: number;
  /** Single-factor point impacts vs a neutral counterfactual (display only). */
  homeImpact: number;
  opponentImpact: number;
  rotationImpact: number;
}

/** Expected points for one specific upcoming fixture. */
export interface FixturePrediction {
  fixtureId: number;
  event: number | null;
  isHome: boolean;
  opponentShort: string;
  opponentName: string;
  difficulty: number;
  expectedPoints: number;
  contributors: Contributor[];
  factors: FixtureFactors;
}

/** Aggregated prediction over a window of gameweeks. */
export interface WindowPrediction {
  window: PredictionWindow;
  gameweeks: number[];
  fixtureCount: number;
  expectedPoints: number;
  /** Contributors summed across the window's fixtures. */
  contributors: Contributor[];
  /** Confidence 0–100. */
  confidence: number;
}

/** The full prediction for a player across all windows. */
export interface PlayerPrediction {
  playerId: number;
  player: Player;
  minutes: MinutesModel;
  fixtures: FixturePrediction[];
  windows: Record<PredictionWindow, WindowPrediction>;
}

/**
 * The engine seam. Consumers (Squad Optimiser, Captain Selector, Transfer
 * Planner, AI Manager) depend on THIS interface, not the implementation — so a
 * future ML engine can be dropped in without touching the rest of the app, as
 * long as it produces the same `PlayerPrediction` shape.
 */
export interface PredictionEngine {
  /** Stable identifier, e.g. "statistical-v1". */
  readonly id: string;
  predictPlayer(player: Player, ctx: PredictionContext): PlayerPrediction;
  predictAll(players: Player[], ctx: PredictionContext): PlayerPrediction[];
}
