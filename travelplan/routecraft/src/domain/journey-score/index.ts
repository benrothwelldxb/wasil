/**
 * RouteCraft's proprietary Journey Score domain module — public surface.
 * See ALGORITHM.md for the full model.
 */
export * from './types';
export { normalizeWeights } from './weights';
export { computeJourneyScore } from './compute';
export { weatherComfortScore } from './weather';
export { deriveJourneyScoreFactors } from './derive';
