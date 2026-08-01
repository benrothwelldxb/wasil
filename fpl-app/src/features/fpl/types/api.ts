/**
 * Raw response types for the public Fantasy Premier League API.
 *
 * These mirror the JSON returned by the FPL endpoints as faithfully as
 * practical. Note that the FPL API returns many numeric stats as **strings**
 * (e.g. `form`, `selected_by_percent`, `expected_goals`); those are typed as
 * `string` here and parsed into numbers by the normalizers.
 *
 * Field names use the API's original `snake_case`. The cleaner, camelCased
 * domain models live in `./models.ts`.
 */

/** A player's availability status flag. */
export type FplStatusCode = "a" | "d" | "i" | "n" | "s" | "u";

/** `element_types[]` — player positions (GKP/DEF/MID/FWD). */
export interface FplElementTypeRaw {
  id: number;
  plural_name: string;
  plural_name_short: string;
  singular_name: string;
  singular_name_short: string;
  squad_select: number;
  squad_min_select: number | null;
  squad_max_select: number | null;
  squad_min_play: number;
  squad_max_play: number;
  ui_shirt_specific: boolean;
  sub_positions_locked: number[];
  element_count: number;
}

/** `teams[]` — Premier League clubs. */
export interface FplTeamRaw {
  code: number;
  draw: number;
  form: string | null;
  id: number;
  loss: number;
  name: string;
  played: number;
  points: number;
  position: number;
  short_name: string;
  strength: number;
  team_division: number | null;
  unavailable: boolean;
  win: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
  pulse_id: number;
}

/** `elements[]` — players. */
export interface FplElementRaw {
  id: number;
  code: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  team_code: number;
  element_type: number;
  status: FplStatusCode;
  news: string;
  news_added: string | null;
  photo: string;

  // Pricing (values are in tenths of a million, e.g. 55 => £5.5m)
  now_cost: number;
  cost_change_start: number;
  cost_change_event: number;
  cost_change_start_fall: number;
  cost_change_event_fall: number;

  // Availability / selection (string-encoded percentages & forecasts)
  selected_by_percent: string;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  ep_this: string | null;
  ep_next: string | null;

  // Scoring
  total_points: number;
  event_points: number;
  points_per_game: string;
  form: string;
  value_form: string;
  value_season: string;

  // Match stats
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  starts: number;

  // Advanced metrics (string-encoded floats)
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;

  // Set-piece duty order (1 = first choice); null when not on duty.
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;

  // Net transfers this gameweek (drive price changes).
  transfers_in_event: number;
  transfers_out_event: number;
}

/** `element_stats[]` — describes the stat identifiers used across the game. */
export interface FplElementStatRaw {
  label: string;
  name: string;
}

/** `events[]` — gameweeks. Only the commonly used fields are typed. */
export interface FplEventRaw {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  data_checked: boolean;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number | null;
  highest_score: number | null;
  most_selected: number | null;
  most_captained: number | null;
  most_transferred_in: number | null;
  top_element: number | null;
  transfers_made: number;
}

/** `phases[]` — scoring phases (e.g. "Overall", monthly). */
export interface FplPhaseRaw {
  id: number;
  name: string;
  start_event: number;
  stop_event: number;
}

/** Top-level payload of `GET /bootstrap-static/`. */
export interface FplBootstrapRaw {
  events: FplEventRaw[];
  phases: FplPhaseRaw[];
  teams: FplTeamRaw[];
  total_players: number;
  elements: FplElementRaw[];
  element_stats: FplElementStatRaw[];
  element_types: FplElementTypeRaw[];
  /** Game-wide settings — shape is large & rarely used; kept opaque. */
  game_settings: Record<string, unknown>;
}

/** A single stat block within a fixture (goals, assists, cards, …). */
export interface FplFixtureStatRaw {
  identifier: string;
  a: { value: number; element: number }[];
  h: { value: number; element: number }[];
}

/** An element of `GET /fixtures/`. */
export interface FplFixtureRaw {
  code: number;
  event: number | null;
  id: number;
  kickoff_time: string | null;
  minutes: number;
  started: boolean | null;
  finished: boolean;
  finished_provisional: boolean;
  provisional_start_time: boolean;
  team_a: number;
  team_a_score: number | null;
  team_h: number;
  team_h_score: number | null;
  team_a_difficulty: number;
  team_h_difficulty: number;
  stats: FplFixtureStatRaw[];
  pulse_id: number;
}
