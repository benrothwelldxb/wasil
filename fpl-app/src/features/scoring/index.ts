/**
 * Player Scoring Engine — public API.
 *
 * A transparent, deterministic (no-AI) engine that scores every player from
 * weighted metrics, projects Expected Points, and produces an Overall Rating
 * personalised via the PreferenceService. All tuning lives in `config.ts`.
 */
export * from "./config";
export * from "./types";
export { computeMetricValues, cleanSheetProbability, ratePer90 } from "./metrics";
export {
  computeExpectedPoints,
  playingProbability,
} from "./expectedPoints";
export { scoreAllPlayers, type ScoringContext } from "./engine";
export { useScoring, type UseScoringResult } from "./useScoring";
export * from "./components";
