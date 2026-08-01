import type {
  FplBootstrapRaw,
  FplElementRaw,
  FplElementTypeRaw,
  FplFixtureRaw,
  FplStatusCode,
  FplTeamRaw,
} from "../types/api";
import type {
  Fixture,
  FplBootstrap,
  Player,
  PlayerAvailability,
  PlayerPrice,
  Position,
  Team,
} from "../types/models";

const PLAYER_PHOTO_BASE =
  "https://resources.premierleague.com/premierleague/photos/players/110x140";

/** Parse a possibly string-encoded numeric field into a finite number. */
function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Map an FPL status flag to a readable availability value. */
function toAvailability(status: FplStatusCode): PlayerAvailability {
  switch (status) {
    case "a":
      return "available";
    case "d":
      return "doubtful";
    case "i":
      return "injured";
    case "s":
      return "suspended";
    case "u":
      return "unavailable";
    case "n":
      return "not-in-squad";
    default:
      return "unavailable";
  }
}

/** Build the CDN URL for a player's photo from the raw `photo` field. */
function toPhotoUrl(photo: string): string {
  const base = photo.replace(/\.[a-z]+$/i, "");
  return `${PLAYER_PHOTO_BASE}/p${base}.png`;
}

export function normalizePosition(raw: FplElementTypeRaw): Position {
  return {
    id: raw.id,
    name: raw.singular_name,
    shortName: raw.singular_name_short,
    pluralName: raw.plural_name,
    squadSelect: raw.squad_select,
    squadMinPlay: raw.squad_min_play,
    squadMaxPlay: raw.squad_max_play,
    elementCount: raw.element_count,
  };
}

export function normalizeTeam(raw: FplTeamRaw): Team {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    shortName: raw.short_name,
    strength: raw.strength,
    played: raw.played,
    win: raw.win,
    draw: raw.draw,
    loss: raw.loss,
    points: raw.points,
    position: raw.position,
    form: raw.form,
    strengthOverallHome: raw.strength_overall_home,
    strengthOverallAway: raw.strength_overall_away,
    strengthAttackHome: raw.strength_attack_home,
    strengthAttackAway: raw.strength_attack_away,
    strengthDefenceHome: raw.strength_defence_home,
    strengthDefenceAway: raw.strength_defence_away,
  };
}

export function normalizePrice(raw: FplElementRaw): PlayerPrice {
  return {
    playerId: raw.id,
    webName: raw.web_name,
    now: raw.now_cost / 10,
    nowRaw: raw.now_cost,
    changeEvent: raw.cost_change_event / 10,
    changeStart: raw.cost_change_start / 10,
  };
}

/** Lookup maps used to resolve foreign keys on players and fixtures. */
export interface FplLookups {
  teamsById: Map<number, Team>;
  positionsById: Map<number, Position>;
}

export function buildLookups(teams: Team[], positions: Position[]): FplLookups {
  return {
    teamsById: new Map(teams.map((t) => [t.id, t])),
    positionsById: new Map(positions.map((p) => [p.id, p])),
  };
}

export function normalizePlayer(
  raw: FplElementRaw,
  lookups: FplLookups,
): Player {
  const team = lookups.teamsById.get(raw.team);
  const position = lookups.positionsById.get(raw.element_type);

  return {
    id: raw.id,
    code: raw.code,
    firstName: raw.first_name,
    secondName: raw.second_name,
    webName: raw.web_name,
    fullName: `${raw.first_name} ${raw.second_name}`.trim(),

    teamId: raw.team,
    teamCode: team?.code ?? raw.team_code,
    teamName: team?.name ?? "Unknown",
    teamShortName: team?.shortName ?? "UNK",

    positionId: raw.element_type,
    positionName: position?.name ?? "Unknown",
    positionShortName: position?.shortName ?? "UNK",

    availability: toAvailability(raw.status),
    news: raw.news,
    chanceOfPlayingNextRound: raw.chance_of_playing_next_round,
    photoUrl: toPhotoUrl(raw.photo),

    price: normalizePrice(raw),

    totalPoints: raw.total_points,
    eventPoints: raw.event_points,
    form: toNumber(raw.form),
    pointsPerGame: toNumber(raw.points_per_game),
    selectedByPercent: toNumber(raw.selected_by_percent),

    minutes: raw.minutes,
    goalsScored: raw.goals_scored,
    assists: raw.assists,
    cleanSheets: raw.clean_sheets,
    goalsConceded: raw.goals_conceded,
    ownGoals: raw.own_goals,
    penaltiesSaved: raw.penalties_saved,
    penaltiesMissed: raw.penalties_missed,
    yellowCards: raw.yellow_cards,
    redCards: raw.red_cards,
    saves: raw.saves,
    bonus: raw.bonus,
    bps: raw.bps,
    starts: raw.starts,

    influence: toNumber(raw.influence),
    creativity: toNumber(raw.creativity),
    threat: toNumber(raw.threat),
    ictIndex: toNumber(raw.ict_index),
    expectedGoals: toNumber(raw.expected_goals),
    expectedAssists: toNumber(raw.expected_assists),
    expectedGoalInvolvements: toNumber(raw.expected_goal_involvements),
    expectedGoalsConceded: toNumber(raw.expected_goals_conceded),

    penaltiesOrder: raw.penalties_order,
    cornersOrder: raw.corners_and_indirect_freekicks_order,
    freeKicksOrder: raw.direct_freekicks_order,
  };
}

/** Normalize the entire bootstrap payload into domain models. */
export function normalizeBootstrap(raw: FplBootstrapRaw): FplBootstrap {
  const positions = raw.element_types.map(normalizePosition);
  const teams = raw.teams.map(normalizeTeam);
  const lookups = buildLookups(teams, positions);

  const players = raw.elements.map((el) => normalizePlayer(el, lookups));
  const prices = raw.elements.map(normalizePrice);

  const currentEvent = raw.events.find((e) => e.is_current);
  const nextEvent = raw.events.find((e) => e.is_next);

  return {
    players,
    teams,
    positions,
    prices,
    totalPlayers: raw.total_players,
    currentEventId: currentEvent?.id ?? null,
    nextEventId: nextEvent?.id ?? null,
  };
}

export function normalizeFixture(
  raw: FplFixtureRaw,
  teamsById: Map<number, Team>,
): Fixture {
  const home = teamsById.get(raw.team_h);
  const away = teamsById.get(raw.team_a);

  return {
    id: raw.id,
    code: raw.code,
    event: raw.event,
    kickoffTime: raw.kickoff_time,
    started: raw.started ?? false,
    finished: raw.finished,
    minutes: raw.minutes,

    homeTeamId: raw.team_h,
    homeTeamName: home?.name ?? "Unknown",
    homeTeamShort: home?.shortName ?? "UNK",
    homeScore: raw.team_h_score,
    homeDifficulty: raw.team_h_difficulty,

    awayTeamId: raw.team_a,
    awayTeamName: away?.name ?? "Unknown",
    awayTeamShort: away?.shortName ?? "UNK",
    awayScore: raw.team_a_score,
    awayDifficulty: raw.team_a_difficulty,
  };
}
