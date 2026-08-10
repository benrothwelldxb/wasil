/**
 * Aggregated mock dataset. This module is the single import surface for all
 * seeded Phase 0 data. Services read from here today; a future backend would
 * replace the service implementations, not the components.
 */

export { MOCK_USER, MOCK_TODAY } from './user';
export { MOCK_CHECKINS, MOCK_PERIODS, MOCK_CYCLES, checkInForDate } from './history';
export { MOCK_TREATMENTS } from './treatments';
export { MOCK_INSIGHTS } from './insights';
export { MOCK_APPOINTMENT } from './appointment';
export { MOCK_ARTICLES, findArticle } from './articles';
export { SYMPTOMS, CONTEXT_TAGS, findSymptom, findContextTag, TODAY_CONTEXT_TAG_IDS } from '../catalog';
