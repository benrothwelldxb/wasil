import { z } from "zod";

/**
 * Zod-first preference model.
 *
 * Defining the schema once gives us both the static TypeScript types (via
 * `z.infer`) and runtime validation for imported profiles — a single source of
 * truth that can't drift.
 */

export const recommendationStyleSchema = z.enum([
  "pure-data",
  "slight-affinity",
  "club-loyalist",
  "die-hard",
]);
export type RecommendationStyle = z.infer<typeof recommendationStyleSchema>;

export const riskProfileSchema = z.enum([
  "conservative",
  "balanced",
  "aggressive",
]);
export type RiskProfile = z.infer<typeof riskProfileSchema>;

export const differentialPreferenceSchema = z.enum([
  "never",
  "occasionally",
  "balanced",
  "prefer",
  "maximum",
]);
export type DifferentialPreference = z.infer<
  typeof differentialPreferenceSchema
>;

export const planningHorizonSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(5),
  z.literal(8),
]);
export type PlanningHorizon = z.infer<typeof planningHorizonSchema>;

export const budgetPhilosophySchema = z.enum([
  "spend-every-penny",
  "balanced",
  "leave-cash",
]);
export type BudgetPhilosophy = z.infer<typeof budgetPhilosophySchema>;

export const rotationToleranceSchema = z.enum([
  "avoid",
  "balanced",
  "high-risk",
]);
export type RotationTolerance = z.infer<typeof rotationToleranceSchema>;

export const playingStyleSchema = z.enum(["attack", "balanced", "defence"]);
export type PlayingStyle = z.infer<typeof playingStyleSchema>;

/** The complete set of user preferences. */
export const preferencesSchema = z.object({
  /** Exactly one supported club, or `null` for none. Only ever a weighting. */
  favouriteClubId: z.number().int().nullable(),
  recommendationStyle: recommendationStyleSchema,
  riskProfile: riskProfileSchema,
  differentialPreference: differentialPreferenceSchema,
  planningHorizon: planningHorizonSchema,
  budgetPhilosophy: budgetPhilosophySchema,
  /** Form ↔ fixtures blend: 1 = 100% form, 0 = 100% fixtures. */
  formBias: z.number().min(0).max(1),
  rotationTolerance: rotationToleranceSchema,
  playingStyle: playingStyleSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** A named, persistable bundle of preferences. */
export const preferenceProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  /** Built-in profiles are read-only; duplicate to customise. */
  builtIn: z.boolean(),
  preferences: preferencesSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PreferenceProfile = z.infer<typeof preferenceProfileSchema>;

/** Wrapper format used by profile import/export. */
export const PROFILE_EXPORT_KIND = "fpl-preference-profile" as const;

export const profileExportSchema = z.object({
  kind: z.literal(PROFILE_EXPORT_KIND),
  version: z.number().int(),
  profile: preferenceProfileSchema,
});
export type ProfileExport = z.infer<typeof profileExportSchema>;
