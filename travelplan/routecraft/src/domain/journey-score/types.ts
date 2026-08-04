/**
 * RouteCraft's proprietary Journey Score — a transparent, user-weightable
 * 12-factor model. Pure domain: this module imports no data/React/datasets; the
 * per-city enrichment signals are injected. See ALGORITHM.md.
 *
 * A factor value is a 0–100 sub-score, or `null` when it does not apply to a
 * journey (e.g. hotel quality on a direct flight). Null factors are dropped and
 * their weight is redistributed across the present factors, so the composite is
 * always a clean 0–100 regardless of which signals are available.
 */
export const JOURNEY_SCORE_FACTORS = [
  'cost',
  'cabinQuality',
  'hotelQuality',
  'weather',
  'transfers',
  'duration',
  'jetLag',
  'airportQuality',
  'touristAppeal',
  'neighbourhoodQuality',
  'foodRating',
  'safety',
] as const;

export type JourneyScoreFactorKey = (typeof JOURNEY_SCORE_FACTORS)[number];

/** Each factor is a 0–100 sub-score, or null when not applicable to the journey. */
export type JourneyScoreFactors = Record<JourneyScoreFactorKey, number | null>;

/** A weight per factor. Effective weights always sum to 1. */
export type JourneyScoreWeights = Record<JourneyScoreFactorKey, number>;

/**
 * Default weights — RouteCraft's experience-first opinion. MUST sum to 1
 * (asserted by tests). Users override these; see `normalizeWeights`.
 */
export const DEFAULT_JOURNEY_SCORE_WEIGHTS: JourneyScoreWeights = {
  cost: 0.15,
  cabinQuality: 0.1,
  hotelQuality: 0.1,
  weather: 0.06,
  transfers: 0.05,
  duration: 0.13,
  jetLag: 0.07,
  airportQuality: 0.05,
  touristAppeal: 0.12,
  neighbourhoodQuality: 0.06,
  foodRating: 0.06,
  safety: 0.05,
};

export const JOURNEY_SCORE_FACTOR_LABELS: Record<JourneyScoreFactorKey, string> = {
  cost: 'Cost',
  cabinQuality: 'Cabin quality',
  hotelQuality: 'Hotel quality',
  weather: 'Weather',
  transfers: 'Transfers',
  duration: 'Journey duration',
  jetLag: 'Jet lag',
  airportQuality: 'Airport quality',
  touristAppeal: 'Tourist appeal',
  neighbourhoodQuality: 'Neighbourhood quality',
  foodRating: 'Food rating',
  safety: 'Safety',
};

export interface JourneyScoreContribution {
  factor: JourneyScoreFactorKey;
  /** 0–100 sub-score, or null if the factor did not apply. */
  value: number | null;
  /** Effective (renormalised) weight this factor carried, 0 when null. */
  weight: number;
  /** value × weight — the factor's points in the composite (0 when null). */
  contribution: number;
}

export interface JourneyScore {
  /** Composite 0–100. */
  total: number;
  /** Echoed factor sub-scores (including nulls). */
  factors: JourneyScoreFactors;
  /** Weights actually used — renormalised over present factors; sums to 1. */
  effectiveWeights: JourneyScoreWeights;
  /** Per-factor breakdown, sorted by contribution desc — powers the "why". */
  contributions: JourneyScoreContribution[];
  narrative: string;
}

/** Per-city enrichment signals fed into factor derivation (all 0–100 unless noted). */
export interface CityScoreSignals {
  touristAppeal?: number;
  foodRating?: number;
  safety?: number;
  neighbourhoodQuality?: number;
  airportQuality?: number;
  /** Pre-normalised 0–100 weather comfort score. */
  weather?: number;
  /** UTC offset in hours (for jet-lag computation). */
  tzOffsetHours?: number;
}

/**
 * Everything the (pure) factor derivation needs beyond the `Journey` itself.
 * The data/UI layer assembles this from the hotel-provider accommodation and
 * the city dataset; missing signals simply yield null factors.
 */
export interface JourneyScoreSignals {
  origin: { airportQuality?: number; tzOffsetHours?: number };
  destination: CityScoreSignals & { tzOffsetHours?: number };
  /** Aligned by index with `journey.stopovers`. */
  stopovers: CityScoreSignals[];
  /** Great-circle direct O→D time (minutes) — the stationary duration reference. */
  referenceDurationMinutes?: number;
}
