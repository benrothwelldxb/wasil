/**
 * Clean, camelCased **domain models** for the FPL data layer.
 *
 * These are what the rest of the application consumes. String-encoded numeric
 * fields from the raw API are parsed to `number`, and foreign keys (team /
 * position) are resolved to human-readable names by the normalizers.
 */

/** Human-friendly player availability. */
export type PlayerAvailability =
  | "available"
  | "doubtful"
  | "injured"
  | "suspended"
  | "unavailable"
  | "not-in-squad";

/** A player position (Goalkeeper, Defender, Midfielder, Forward). */
export interface Position {
  id: number;
  /** Singular name, e.g. "Goalkeeper". */
  name: string;
  /** Short code, e.g. "GKP". */
  shortName: string;
  /** Plural name, e.g. "Goalkeepers". */
  pluralName: string;
  squadSelect: number;
  squadMinPlay: number;
  squadMaxPlay: number;
  /** Number of players currently in this position. */
  elementCount: number;
}

/** A Premier League club. */
export interface Team {
  id: number;
  code: number;
  name: string;
  shortName: string;
  strength: number;
  played: number;
  win: number;
  draw: number;
  loss: number;
  points: number;
  position: number;
  form: string | null;
  strengthOverallHome: number;
  strengthOverallAway: number;
  strengthAttackHome: number;
  strengthAttackAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

/** A player's price, in millions (£), derived from the raw tenths values. */
export interface PlayerPrice {
  playerId: number;
  webName: string;
  /** Current price in £m, e.g. 5.5. */
  now: number;
  /** Raw `now_cost` in tenths of a million, e.g. 55. */
  nowRaw: number;
  /** Price change this gameweek, in £m. */
  changeEvent: number;
  /** Total price change since the season start, in £m. */
  changeStart: number;
}

/** A fully-resolved player. */
export interface Player {
  id: number;
  code: number;
  firstName: string;
  secondName: string;
  webName: string;
  fullName: string;

  teamId: number;
  teamCode: number;
  teamName: string;
  teamShortName: string;

  positionId: number;
  positionName: string;
  positionShortName: string;

  availability: PlayerAvailability;
  news: string;
  chanceOfPlayingNextRound: number | null;
  photoUrl: string;

  price: PlayerPrice;

  // Scoring & selection
  totalPoints: number;
  eventPoints: number;
  form: number;
  pointsPerGame: number;
  selectedByPercent: number;

  // Match stats
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  starts: number;

  // Advanced metrics
  influence: number;
  creativity: number;
  threat: number;
  ictIndex: number;
  expectedGoals: number;
  expectedAssists: number;
  expectedGoalInvolvements: number;
  expectedGoalsConceded: number;

  /** Set-piece duty order (1 = first choice), or `null` when not on duty. */
  penaltiesOrder: number | null;
  cornersOrder: number | null;
  freeKicksOrder: number | null;

  /** Transfers in/out this gameweek — the raw material for price changes. */
  transfersInEvent: number;
  transfersOutEvent: number;

  /** FPL's own expected points for the next gameweek (early-season fallback). */
  epNext: number | null;
}

/** A resolved fixture between two clubs. */
export interface Fixture {
  id: number;
  code: number;
  /** Gameweek number, or `null` if not yet scheduled. */
  event: number | null;
  kickoffTime: string | null;
  started: boolean;
  finished: boolean;
  minutes: number;

  homeTeamId: number;
  homeTeamName: string;
  homeTeamShort: string;
  homeScore: number | null;
  homeDifficulty: number;

  awayTeamId: number;
  awayTeamName: string;
  awayTeamShort: string;
  awayScore: number | null;
  awayDifficulty: number;
}

/**
 * The normalized shape of the entire bootstrap payload — the single source of
 * truth from which players, teams, positions and prices are derived.
 */
export interface FplBootstrap {
  players: Player[];
  teams: Team[];
  positions: Position[];
  prices: PlayerPrice[];
  totalPlayers: number;
  /** The current gameweek id, if the season is in progress. */
  currentEventId: number | null;
  /** The next gameweek id, if known. */
  nextEventId: number | null;
  /** ISO deadline for the next gameweek, if known (transfers lock here). */
  nextDeadline: string | null;
}
