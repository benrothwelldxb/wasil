/**
 * Experience-score factor weights and the preference-driven modulation of them.
 * All magic weights live here — nowhere else in the codebase.
 */
import type { ExperienceFactorKey, TravelPreference } from '../types';

export type FactorWeights = Record<ExperienceFactorKey, number>;

/** Base weights — MUST sum to 1.0 (asserted by unit test). */
export const BASE_WEIGHTS: FactorWeights = {
  stopoverAppeal: 0.25,
  comfort: 0.2,
  travelTimeEfficiency: 0.2,
  layoverQuality: 0.15,
  valueForMoney: 0.1,
  scheduleConvenience: 0.1,
};

/** Each selected preference multiplies one factor's weight, then all re-normalise. */
export const PREFERENCE_WEIGHT_MODIFIERS: Record<
  TravelPreference,
  { factor: ExperienceFactorKey; multiplier: number }
> = {
  speed: { factor: 'travelTimeEfficiency', multiplier: 1.6 },
  comfort: { factor: 'comfort', multiplier: 1.5 },
  relaxation: { factor: 'layoverQuality', multiplier: 1.4 },
  culture: { factor: 'stopoverAppeal', multiplier: 1.35 },
  food: { factor: 'stopoverAppeal', multiplier: 1.35 },
  nightlife: { factor: 'stopoverAppeal', multiplier: 1.35 },
  nature: { factor: 'stopoverAppeal', multiplier: 1.35 },
  shopping: { factor: 'stopoverAppeal', multiplier: 1.35 },
  family: { factor: 'stopoverAppeal', multiplier: 1.35 },
};

/**
 * Effective weights after applying the traveller's preferences, re-normalised
 * to sum to exactly 1.
 */
export function effectiveWeights(preferences: TravelPreference[]): FactorWeights {
  const w: FactorWeights = { ...BASE_WEIGHTS };

  for (const pref of preferences) {
    const mod = PREFERENCE_WEIGHT_MODIFIERS[pref];
    if (mod) w[mod.factor] *= mod.multiplier;
  }

  const sum = (Object.values(w) as number[]).reduce((a, b) => a + b, 0);
  (Object.keys(w) as ExperienceFactorKey[]).forEach((k) => {
    w[k] = w[k] / sum;
  });

  return w;
}
