/**
 * Preferences feature — public API.
 *
 * A configurable, persisted user-preference engine plus a reusable
 * {@link PreferenceService} that every future recommendation engine consumes
 * to personalise its output. Contains NO optimisation logic.
 */

// Model & validation
export * from "./schema";
export {
  NEUTRAL_PREFERENCES,
  BUILT_IN_PROFILES,
  BUILT_IN_PROFILE_SPECS,
  BUILT_IN_DESCRIPTIONS,
  DEFAULT_PROFILE_ID,
} from "./profiles";
export * from "./options";

// The service (the integration point for future engines)
export {
  PreferenceService,
  createPreferenceService,
  type AdjustmentSource,
  type ScoreAdjustment,
  type AdjustedScore,
  type PlayerEvaluationContext,
  type PlanningWindow,
} from "./PreferenceService";
export {
  deriveSignals,
  resolveSignals,
  type PlayerSignals,
} from "./signals";

// State & hooks
export { usePreferenceStore, type ImportResult } from "./preferenceStore";
export {
  useActivePreferences,
  useActiveProfile,
  usePreferenceService,
} from "./usePreferences";

// UI
export * from "./components";
