/**
 * Curated per-city "livability" dataset: walking/safety/neighbourhood scores
 * plus a compact climate profile that lets `weatherForMonth` derive a plausible
 * `WeatherSummary` for any request month — all pure, deterministic, no RNG.
 *
 * Every `STOPOVER_HUBS` city (and a few endpoint-only cities) is curated below.
 * Anything not listed falls back to a deterministic estimate derived from the
 * city's `appealScore`, via `getLivability`.
 */
import type { WeatherCondition, WeatherSummary } from '@/domain/hotels/types';
import type { ISODateString } from '@/domain/types';

/**
 * A compact seasonal model: temperature swings sinusoidally between a peak
 * (warmest) and trough (coldest) month; precipitation/condition switch between
 * a "wet season" set of months and everything else.
 */
export interface CityClimateProfile {
  /** Month (1–12) of the warmest average temperature. */
  peakMonth: number;
  peakHighC: number;
  peakLowC: number;
  /** Month (1–12) of the coldest average temperature is implicitly 6 months from peak. */
  troughHighC: number;
  troughLowC: number;
  /** Months (1–12) considered the wet/rainy season. */
  wetMonths: number[];
  dryPrecipChance: number; // 0..1
  wetPrecipChance: number; // 0..1
  dryCondition: WeatherCondition;
  wetCondition: WeatherCondition;
  /** If the month's average low drops to/below this, the condition becomes 'snowy'. */
  snowBelowC?: number;
}

export interface CityLivability {
  walkingScore: number; // 0..100
  safetyScore: number; // 0..100
  neighbourhoodRating: number; // 0..5
  climate: CityClimateProfile;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Extracts the 1–12 calendar month from a `YYYY-MM-DD` request date. */
export function monthOf(date: ISODateString): number {
  const month = Number(date.slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
}

/** Pure, deterministic seasonal weather estimate for a given calendar month. */
export function weatherForMonth(profile: CityClimateProfile, month: number): WeatherSummary {
  const angle = (((month - profile.peakMonth + 12) % 12) / 12) * 2 * Math.PI;
  const warmth = (Math.cos(angle) + 1) / 2; // 1 at the peak month, 0 at the trough

  const averageHighC = profile.troughHighC + warmth * (profile.peakHighC - profile.troughHighC);
  const averageLowC = profile.troughLowC + warmth * (profile.peakLowC - profile.troughLowC);

  const isWet = profile.wetMonths.includes(month);
  const precipitationChance = isWet ? profile.wetPrecipChance : profile.dryPrecipChance;
  let condition: WeatherCondition = isWet ? profile.wetCondition : profile.dryCondition;
  if (profile.snowBelowC !== undefined && averageLowC <= profile.snowBelowC) {
    condition = 'snowy';
  }

  return {
    condition,
    averageHighC: round1(averageHighC),
    averageLowC: round1(averageLowC),
    precipitationChance,
  };
}

const TEMPERATE_NORTHERN: CityClimateProfile = {
  peakMonth: 7,
  peakHighC: 26,
  peakLowC: 16,
  troughHighC: 10,
  troughLowC: 3,
  wetMonths: [11, 12, 1, 2],
  dryPrecipChance: 0.2,
  wetPrecipChance: 0.45,
  dryCondition: 'partly_cloudy',
  wetCondition: 'rainy',
};

const CITY_LIVABILITY: Readonly<Record<string, CityLivability>> = {
  IST: {
    walkingScore: 78,
    safetyScore: 62,
    neighbourhoodRating: 3.8,
    climate: {
      peakMonth: 7,
      peakHighC: 29,
      peakLowC: 20,
      troughHighC: 9,
      troughLowC: 3,
      wetMonths: [11, 12, 1, 2, 3],
      dryPrecipChance: 0.15,
      wetPrecipChance: 0.5,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
      snowBelowC: 0,
    },
  },
  DOH: {
    walkingScore: 45,
    safetyScore: 88,
    neighbourhoodRating: 3.5,
    climate: {
      peakMonth: 8,
      peakHighC: 41,
      peakLowC: 30,
      troughHighC: 21,
      troughLowC: 13,
      wetMonths: [12, 1, 2],
      dryPrecipChance: 0.02,
      wetPrecipChance: 0.15,
      dryCondition: 'sunny',
      wetCondition: 'partly_cloudy',
    },
  },
  DXB: {
    walkingScore: 52,
    safetyScore: 90,
    neighbourhoodRating: 3.7,
    climate: {
      peakMonth: 8,
      peakHighC: 41,
      peakLowC: 31,
      troughHighC: 24,
      troughLowC: 14,
      wetMonths: [1, 2, 12],
      dryPrecipChance: 0.02,
      wetPrecipChance: 0.1,
      dryCondition: 'sunny',
      wetCondition: 'partly_cloudy',
    },
  },
  AMS: {
    walkingScore: 92,
    safetyScore: 80,
    neighbourhoodRating: 4.3,
    climate: {
      peakMonth: 7,
      peakHighC: 22,
      peakLowC: 13,
      troughHighC: 6,
      troughLowC: 1,
      wetMonths: [10, 11, 12, 1, 2],
      dryPrecipChance: 0.35,
      wetPrecipChance: 0.55,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: 0,
    },
  },
  SIN: {
    walkingScore: 88,
    safetyScore: 92,
    neighbourhoodRating: 4.2,
    climate: {
      peakMonth: 5,
      peakHighC: 32,
      peakLowC: 25,
      troughHighC: 30,
      troughLowC: 24,
      wetMonths: [11, 12, 1],
      dryPrecipChance: 0.4,
      wetPrecipChance: 0.65,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
    },
  },
  KEF: {
    walkingScore: 75,
    safetyScore: 95,
    neighbourhoodRating: 4.0,
    climate: {
      peakMonth: 7,
      peakHighC: 14,
      peakLowC: 8,
      troughHighC: 2,
      troughLowC: -3,
      wetMonths: [9, 10, 11, 12, 1],
      dryPrecipChance: 0.35,
      wetPrecipChance: 0.5,
      dryCondition: 'cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  LIS: {
    walkingScore: 80,
    safetyScore: 78,
    neighbourhoodRating: 4.1,
    climate: {
      peakMonth: 8,
      peakHighC: 28,
      peakLowC: 18,
      troughHighC: 15,
      troughLowC: 8,
      wetMonths: [11, 12, 1, 2, 3],
      dryPrecipChance: 0.1,
      wetPrecipChance: 0.45,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  VIE: {
    walkingScore: 85,
    safetyScore: 88,
    neighbourhoodRating: 4.3,
    climate: {
      peakMonth: 7,
      peakHighC: 25,
      peakLowC: 15,
      troughHighC: 2,
      troughLowC: -3,
      wetMonths: [6, 7, 8],
      dryPrecipChance: 0.25,
      wetPrecipChance: 0.4,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  HEL: {
    walkingScore: 82,
    safetyScore: 90,
    neighbourhoodRating: 4.0,
    climate: {
      peakMonth: 7,
      peakHighC: 22,
      peakLowC: 13,
      troughHighC: -2,
      troughLowC: -8,
      wetMonths: [7, 8, 9, 10],
      dryPrecipChance: 0.3,
      wetPrecipChance: 0.45,
      dryCondition: 'cloudy',
      wetCondition: 'rainy',
      snowBelowC: -2,
    },
  },
  BKK: {
    walkingScore: 55,
    safetyScore: 60,
    neighbourhoodRating: 3.3,
    climate: {
      peakMonth: 4,
      peakHighC: 35,
      peakLowC: 26,
      troughHighC: 32,
      troughLowC: 21,
      wetMonths: [6, 7, 8, 9, 10],
      dryPrecipChance: 0.1,
      wetPrecipChance: 0.6,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  KUL: {
    walkingScore: 48,
    safetyScore: 62,
    neighbourhoodRating: 3.2,
    climate: {
      peakMonth: 4,
      peakHighC: 33,
      peakLowC: 24,
      troughHighC: 31,
      troughLowC: 23,
      wetMonths: [10, 11, 12],
      dryPrecipChance: 0.4,
      wetPrecipChance: 0.6,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
    },
  },
  ATH: {
    walkingScore: 75,
    safetyScore: 68,
    neighbourhoodRating: 3.7,
    climate: {
      peakMonth: 7,
      peakHighC: 33,
      peakLowC: 23,
      troughHighC: 13,
      troughLowC: 7,
      wetMonths: [11, 12, 1],
      dryPrecipChance: 0.05,
      wetPrecipChance: 0.4,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  FCO: {
    walkingScore: 78,
    safetyScore: 70,
    neighbourhoodRating: 4.0,
    climate: {
      peakMonth: 7,
      peakHighC: 30,
      peakLowC: 19,
      troughHighC: 12,
      troughLowC: 4,
      wetMonths: [10, 11, 12],
      dryPrecipChance: 0.15,
      wetPrecipChance: 0.45,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  CDG: {
    walkingScore: 88,
    safetyScore: 72,
    neighbourhoodRating: 4.2,
    climate: {
      peakMonth: 7,
      peakHighC: 25,
      peakLowC: 15,
      troughHighC: 7,
      troughLowC: 3,
      wetMonths: [10, 11, 12, 1],
      dryPrecipChance: 0.3,
      wetPrecipChance: 0.45,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
    },
  },
  FRA: {
    walkingScore: 80,
    safetyScore: 78,
    neighbourhoodRating: 3.8,
    climate: {
      peakMonth: 7,
      peakHighC: 25,
      peakLowC: 15,
      troughHighC: 4,
      troughLowC: -1,
      wetMonths: [11, 12, 1],
      dryPrecipChance: 0.3,
      wetPrecipChance: 0.4,
      dryCondition: 'cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  ZRH: {
    walkingScore: 82,
    safetyScore: 92,
    neighbourhoodRating: 4.3,
    climate: {
      peakMonth: 7,
      peakHighC: 25,
      peakLowC: 14,
      troughHighC: 3,
      troughLowC: -3,
      wetMonths: [6, 7, 8],
      dryPrecipChance: 0.28,
      wetPrecipChance: 0.4,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  MAD: {
    walkingScore: 82,
    safetyScore: 75,
    neighbourhoodRating: 4.0,
    climate: {
      peakMonth: 7,
      peakHighC: 33,
      peakLowC: 18,
      troughHighC: 10,
      troughLowC: 2,
      wetMonths: [4, 10, 11],
      dryPrecipChance: 0.08,
      wetPrecipChance: 0.35,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  CAI: {
    walkingScore: 55,
    safetyScore: 65,
    neighbourhoodRating: 3.0,
    climate: {
      peakMonth: 7,
      peakHighC: 35,
      peakLowC: 22,
      troughHighC: 19,
      troughLowC: 9,
      wetMonths: [],
      dryPrecipChance: 0.02,
      wetPrecipChance: 0.05,
      dryCondition: 'sunny',
      wetCondition: 'sunny',
    },
  },
  MAN: {
    walkingScore: 85,
    safetyScore: 62,
    neighbourhoodRating: 3.4,
    climate: {
      peakMonth: 7,
      peakHighC: 20,
      peakLowC: 12,
      troughHighC: 7,
      troughLowC: 2,
      wetMonths: [10, 11, 12, 1, 2],
      dryPrecipChance: 0.4,
      wetPrecipChance: 0.55,
      dryCondition: 'cloudy',
      wetCondition: 'rainy',
    },
  },
  LHR: {
    walkingScore: 90,
    safetyScore: 65,
    neighbourhoodRating: 4.0,
    climate: {
      peakMonth: 7,
      peakHighC: 23,
      peakLowC: 14,
      troughHighC: 8,
      troughLowC: 3,
      wetMonths: [10, 11, 12, 1],
      dryPrecipChance: 0.35,
      wetPrecipChance: 0.5,
      dryCondition: 'cloudy',
      wetCondition: 'rainy',
    },
  },
  JFK: {
    walkingScore: 88,
    safetyScore: 60,
    neighbourhoodRating: 3.9,
    climate: {
      peakMonth: 7,
      peakHighC: 29,
      peakLowC: 21,
      troughHighC: 3,
      troughLowC: -4,
      wetMonths: [6, 7, 8],
      dryPrecipChance: 0.32,
      wetPrecipChance: 0.38,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  NRT: {
    walkingScore: 90,
    safetyScore: 92,
    neighbourhoodRating: 4.3,
    climate: {
      peakMonth: 8,
      peakHighC: 31,
      peakLowC: 24,
      troughHighC: 10,
      troughLowC: 2,
      wetMonths: [6, 7, 9],
      dryPrecipChance: 0.25,
      wetPrecipChance: 0.55,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: -1,
    },
  },
  SYD: {
    walkingScore: 80,
    safetyScore: 78,
    neighbourhoodRating: 4.0,
    climate: {
      // Southern hemisphere: January is midsummer.
      peakMonth: 1,
      peakHighC: 26,
      peakLowC: 19,
      troughHighC: 17,
      troughLowC: 9,
      wetMonths: [3, 4, 5, 6],
      dryPrecipChance: 0.25,
      wetPrecipChance: 0.4,
      dryCondition: 'sunny',
      wetCondition: 'rainy',
    },
  },
  YYZ: {
    walkingScore: 75,
    safetyScore: 82,
    neighbourhoodRating: 3.8,
    climate: {
      peakMonth: 7,
      peakHighC: 27,
      peakLowC: 17,
      troughHighC: -2,
      troughLowC: -9,
      wetMonths: [11, 12, 4],
      dryPrecipChance: 0.3,
      wetPrecipChance: 0.4,
      dryCondition: 'partly_cloudy',
      wetCondition: 'rainy',
      snowBelowC: -2,
    },
  },
};

/**
 * Deterministic fallback for any city not explicitly curated above: a plain
 * function of `appealScore` (0..100), plus a generic northern-temperate
 * climate profile.
 */
function fallbackLivability(appealScore: number): CityLivability {
  const clamped = Math.min(100, Math.max(0, appealScore));
  return {
    walkingScore: Math.min(100, Math.max(0, 35 + clamped * 0.55)),
    safetyScore: Math.min(100, Math.max(0, 45 + clamped * 0.45)),
    neighbourhoodRating: Math.min(5, Math.max(0, 2 + (clamped / 100) * 3)),
    climate: TEMPERATE_NORTHERN,
  };
}

/** Curated livability for `iata`, or a deterministic fallback from `appealScore`. */
export function getLivability(iata: string, appealScore: number): CityLivability {
  return CITY_LIVABILITY[iata] ?? fallbackLivability(appealScore);
}

/** Whether `iata` has explicitly curated livability/climate data (vs. the generic fallback). */
export function hasCuratedCity(iata: string): boolean {
  return iata in CITY_LIVABILITY;
}
