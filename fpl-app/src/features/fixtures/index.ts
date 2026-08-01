/**
 * Fixture Analysis feature — public API.
 *
 * Turns the raw fixtures list into per-team upcoming-fixture analysis: next /
 * next-3 / next-5 windows, difficulty, home/away weighting, and ease ratings
 * out of 100 — plus the coloured "run" UI. Refreshes automatically each
 * gameweek via the shared fixtures query.
 */
export * from "./types";
export {
  HOME_ADVANTAGE,
  effectiveDifficulty,
  computeWindow,
  buildFixtureAnalysisMap,
} from "./analysis";
export {
  buildGameweekCalendar,
  classifyGameweek,
  NOTABLE_BLANK,
  NOTABLE_DOUBLE,
  type GameweekOutlook,
  type GameweekCalendar,
  type GameweekKind,
} from "./calendar";
export {
  useGameweekCalendar,
  type UseGameweekCalendarResult,
} from "./useGameweekCalendar";
export {
  difficultyClasses,
  ratingTextClass,
  ratingBgClass,
} from "./colors";
export {
  useFixtureAnalysis,
  type UseFixtureAnalysisResult,
} from "./useFixtureAnalysis";
export * from "./components";
