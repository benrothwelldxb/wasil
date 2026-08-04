/**
 * Per-factor normalisers — each returns a 0–100 score for one experience factor.
 * Pure and deterministic; no set-level state except where explicitly passed in.
 */
import type { ExperienceFactors, Journey, SearchCriteria, TravelPreference } from '../types';
import { clamp, mean } from '../math';

export { clamp };

const DIRECT_APPEAL_BASELINE = 35;
const NIGHTS_FACTOR: Record<number, number> = { 1: 0.85, 2: 1.0, 3: 0.95 };

/** Preferences that describe a *destination* experience (feed appeal prefMatch). */
const EXPERIENCE_PREFS: TravelPreference[] = [
  'culture',
  'food',
  'nightlife',
  'nature',
  'shopping',
  'relaxation',
  'family',
];

export function stopoverAppeal(journey: Journey, preferences: TravelPreference[]): number {
  if (journey.stopovers.length === 0) return DIRECT_APPEAL_BASELINE;

  const prefSet = new Set(preferences.filter((p) => EXPERIENCE_PREFS.includes(p)));

  const perCity = journey.stopovers.map((s) => {
    const nightsFactor = NIGHTS_FACTOR[s.nights] ?? 0.9;
    const matches = s.tags.filter((t) => prefSet.has(t)).length;
    const prefMatch = 1 + 0.15 * Math.min(2, matches);
    return clamp(s.appealScore * nightsFactor * prefMatch);
  });

  // Non-empty by construction (guarded above), so the shared `mean` never
  // returns null here; `?? 0` only satisfies the type checker.
  const perCityMean = mean(perCity) ?? 0;

  // Variety bonus: multi-country stopovers broaden the experience.
  const countries = new Set(journey.stopovers.map((s) => s.countryCode));
  const varietyBonus = countries.size > 1 ? 5 : 0;

  return clamp(perCityMean + varietyBonus);
}

const RED_EYE_PENALTY = 12;

export function comfort(journey: Journey): number {
  const flightComfort =
    (journey.legs.reduce((sum, l) => sum + l.airline.comfortRating, 0) / journey.legs.length) *
    20;

  let base = flightComfort;
  if (journey.stopovers.length > 0) {
    const hotelComfort =
      journey.stopovers.reduce(
        (sum, s) => sum + s.hotel.starRating * 12 + s.hotel.guestRating * 4,
        0,
      ) / journey.stopovers.length;
    base = flightComfort * 0.6 + hotelComfort * 0.4;
  }

  const redEyes = journey.legs.filter((l) => l.isRedEye).length;
  return clamp(base - redEyes * RED_EYE_PENALTY);
}

/**
 * Relative to the fastest candidate in the result set. Exponent 1.5 punishes
 * egregious detours. Stopover nights are excluded from travel time by design.
 */
export function travelTimeEfficiency(journey: Journey, fastestMinutes: number): number {
  if (journey.totalTravelTimeMinutes <= 0 || fastestMinutes <= 0) return 100;
  const ratio = fastestMinutes / journey.totalTravelTimeMinutes;
  return clamp(100 * Math.pow(Math.min(1, ratio), 1.5));
}

/**
 * Ground-connection smoothness at each stopover. Direct journeys are perfect.
 * Longer airport transfers and very long stays erode the score.
 */
export function layoverQuality(journey: Journey): number {
  if (journey.stopovers.length === 0) return 100;

  const perCity = journey.stopovers.map((s) => {
    const avgTransfer =
      (s.transfers.arrival.durationMinutes + s.transfers.departure.durationMinutes) / 2;
    let q = 100;
    if (avgTransfer > 90) q -= 30;
    else if (avgTransfer > 60) q -= 15;
    if (s.nights >= 3) q -= 10;
    // Reward comfortable transfer modes slightly.
    const transferComfort =
      (s.transfers.arrival.comfortRating + s.transfers.departure.comfortRating) / 2;
    q += (transferComfort - 3) * 3;
    return clamp(q);
  });

  return clamp(perCity.reduce((a, b) => a + b, 0) / perCity.length);
}

/** Concave reward for spending less of the budget. */
export function valueForMoney(headroomPct: number): number {
  return clamp(100 * Math.pow(Math.max(0, Math.min(1, headroomPct)), 0.7));
}

const getHour = (iso: string): number => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 12 : d.getUTCHours();
};

export function scheduleConvenience(journey: Journey): number {
  let score = 100;
  const firstDep = journey.legs[0];
  const lastArr = journey.legs[journey.legs.length - 1];

  if (firstDep) {
    const depHour = getHour(firstDep.departure) + new Date(firstDep.departure).getUTCMinutes() / 60;
    if (depHour < 6.5) score -= 20;
  }
  if (lastArr) {
    const arrHour = getHour(lastArr.arrival);
    if (arrHour >= 0 && arrHour < 6) score -= 15;
  }
  // Any red-eye leg dents schedule convenience beyond comfort.
  score -= journey.legs.filter((l) => l.isRedEye).length * 5;

  return clamp(score);
}

export interface FactorContext {
  criteria: SearchCriteria;
  fastestTravelTimeMinutes: number;
}

export function computeFactors(journey: Journey, ctx: FactorContext): ExperienceFactors {
  return {
    stopoverAppeal: stopoverAppeal(journey, ctx.criteria.preferences),
    comfort: comfort(journey),
    travelTimeEfficiency: travelTimeEfficiency(journey, ctx.fastestTravelTimeMinutes),
    layoverQuality: layoverQuality(journey),
    valueForMoney: valueForMoney(journey.cost.headroomPct),
    scheduleConvenience: scheduleConvenience(journey),
  };
}
