/** A single upcoming fixture from one team's perspective. */
export interface UpcomingFixture {
  fixtureId: number;
  /** Gameweek number, or `null` if not yet scheduled. */
  event: number | null;
  isHome: boolean;
  opponentId: number;
  opponentShort: string;
  opponentName: string;
  /** FPL difficulty (1 = easiest … 5 = hardest) from this team's viewpoint. */
  difficulty: number;
  kickoffTime: string | null;
}

/** A rating summary over a window of upcoming fixtures. */
export interface FixtureWindowRating {
  /** How many fixtures were actually counted (handles blanks/short runs). */
  games: number;
  /** Mean raw FPL difficulty over the window (1–5). */
  averageDifficulty: number;
  /**
   * Ease rating out of 100 (100 = easiest run), incorporating the
   * home/away weighting. `null`-equivalent when `games === 0`.
   */
  rating: number;
}

/** Fixture analysis for one club, driving player enhancement & the ticker. */
export interface TeamFixtureAnalysis {
  teamId: number;
  /** Upcoming (unfinished) fixtures in chronological order. */
  fixtures: UpcomingFixture[];
  /** The very next fixture, or `null`. */
  next: UpcomingFixture | null;
  next1: FixtureWindowRating;
  next3: FixtureWindowRating;
  next5: FixtureWindowRating;
}

/** Team-id → analysis. */
export type FixtureAnalysisMap = Map<number, TeamFixtureAnalysis>;
