/**
 * Public surface of the stopover discovery engine. Consumers (the data layer's
 * `stopover-v1` FlightAdapter, and tests) should import from here rather than
 * reaching into `recommend.ts` / `discover.ts` / `types.ts` directly.
 */
export { discoverStopoverJourneys } from './discover';
export { HeuristicCandidateRecommender, heuristicRecommender, scoreCandidate } from './recommend';
export type { ScoredCandidate } from './recommend';
export * from './types';
