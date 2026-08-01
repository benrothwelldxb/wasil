import type { PreferenceProfile, Preferences } from "./schema";

/** A neutral, zero-bias baseline used as the starting point for profiles. */
export const NEUTRAL_PREFERENCES: Preferences = {
  favouriteClubId: null,
  avoidClubIds: [],
  recommendationStyle: "pure-data",
  riskProfile: "balanced",
  differentialPreference: "balanced",
  planningHorizon: 3,
  budgetPhilosophy: "balanced",
  formBias: 0.5,
  rotationTolerance: "balanced",
  playingStyle: "balanced",
};

interface BuiltInSpec {
  id: string;
  name: string;
  description: string;
  preferences: Preferences;
}

/**
 * Built-in profile specs. Timestamps are fixed (0) so built-ins stay stable
 * across reloads and never look "edited".
 */
export const BUILT_IN_PROFILE_SPECS: BuiltInSpec[] = [
  {
    id: "builtin-data-scientist",
    name: "Data Scientist",
    description: "Pure optimisation — mathematically optimal, zero bias.",
    preferences: {
      ...NEUTRAL_PREFERENCES,
      recommendationStyle: "pure-data",
      planningHorizon: 5,
    },
  },
  {
    id: "builtin-club-loyalist",
    name: "Club Loyalist",
    description:
      "A moderate lean toward your club while points stay competitive.",
    preferences: {
      ...NEUTRAL_PREFERENCES,
      recommendationStyle: "club-loyalist",
      differentialPreference: "occasionally",
      planningHorizon: 3,
    },
  },
  {
    id: "builtin-safe-climber",
    name: "Safe Climber",
    description: "Consistency, reliable minutes, and a high floor.",
    preferences: {
      ...NEUTRAL_PREFERENCES,
      riskProfile: "conservative",
      differentialPreference: "occasionally",
      rotationTolerance: "avoid",
      budgetPhilosophy: "leave-cash",
      formBias: 0.6,
      planningHorizon: 3,
    },
  },
  {
    id: "builtin-mini-league-chaser",
    name: "Mini League Chaser",
    description: "Lean into differentials and upside to climb your league.",
    preferences: {
      ...NEUTRAL_PREFERENCES,
      riskProfile: "aggressive",
      differentialPreference: "prefer",
      playingStyle: "attack",
      budgetPhilosophy: "spend-every-penny",
      planningHorizon: 5,
    },
  },
  {
    id: "builtin-go-big-or-go-home",
    name: "Go Big Or Go Home",
    description: "Maximum variance: explosive, low-owned, all-in.",
    preferences: {
      ...NEUTRAL_PREFERENCES,
      riskProfile: "aggressive",
      differentialPreference: "maximum",
      rotationTolerance: "high-risk",
      playingStyle: "attack",
      budgetPhilosophy: "spend-every-penny",
      formBias: 0.4,
      planningHorizon: 8,
    },
  },
];

/** Descriptions keyed by id, for UI. */
export const BUILT_IN_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  BUILT_IN_PROFILE_SPECS.map((s) => [s.id, s.description]),
);

/** Materialised built-in profiles. */
export const BUILT_IN_PROFILES: PreferenceProfile[] =
  BUILT_IN_PROFILE_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    builtIn: true,
    preferences: spec.preferences,
    createdAt: 0,
    updatedAt: 0,
  }));

/** The default active profile (Data Scientist). */
export const DEFAULT_PROFILE_ID = BUILT_IN_PROFILE_SPECS[0]!.id;
