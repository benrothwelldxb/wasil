/**
 * Pure derivation of the twelve Journey Score factors from a `Journey` plus
 * injected `JourneyScoreSignals`. See ALGORITHM.md §"The twelve factors".
 */
import type { Journey, StopoverCity } from '@/domain/types';
import type { CityScoreSignals, JourneyScoreFactors, JourneyScoreSignals } from './types';

const clamp = (n: number, min = 0, max = 100): number => Math.min(max, Math.max(min, n));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const CABIN_BASE: Record<Journey['legs'][number]['cabin'], number> = {
  economy: 50,
  premium_economy: 74,
  business: 94,
};

/**
 * "Stopover-or-dest": use the mean over stopovers when the journey has them,
 * else the destination signal, else null.
 */
function stopoverOrDest(
  journey: Journey,
  signals: JourneyScoreSignals,
  pick: (s: CityScoreSignals) => number | undefined,
): number | null {
  if (journey.stopovers.length > 0) {
    const values: number[] = [];
    for (let i = 0; i < journey.stopovers.length; i += 1) {
      const cityScore = signals.stopovers[i];
      const value = cityScore ? pick(cityScore) : undefined;
      if (typeof value === 'number') values.push(value);
    }
    return mean(values);
  }
  const destValue = pick(signals.destination);
  return typeof destValue === 'number' ? destValue : null;
}

function deriveCost(journey: Journey): number {
  return clamp(100 * Math.pow(clamp01(journey.cost.headroomPct), 0.7));
}

function deriveCabinQuality(journey: Journey): number {
  const perLeg = journey.legs.map(
    (leg) => 0.6 * CABIN_BASE[leg.cabin] + 0.4 * (leg.airline.comfortRating * 20),
  );
  const value = mean(perLeg);
  return clamp(value === null ? 0 : value);
}

function deriveHotelQuality(journey: Journey): number | null {
  if (journey.stopovers.length === 0) return null;
  const perStop = journey.stopovers.map((s) => clamp(s.hotel.starRating * 12 + s.hotel.guestRating * 4));
  return mean(perStop);
}

function deriveWeather(journey: Journey, signals: JourneyScoreSignals): number | null {
  return stopoverOrDest(journey, signals, (s) => s.weather);
}

interface StopoverTransferStats {
  avgMinutes: number;
  avgComfort: number;
}

function averageStopoverTransfer(stop: StopoverCity): StopoverTransferStats {
  const avgMinutes =
    (stop.transfers.arrival.durationMinutes + stop.transfers.departure.durationMinutes) / 2;
  const avgComfort =
    (stop.transfers.arrival.comfortRating + stop.transfers.departure.comfortRating) / 2;
  return { avgMinutes, avgComfort };
}

function deriveTransfers(journey: Journey): number | null {
  if (journey.stopovers.length === 0) return null;
  const perStop = journey.stopovers.map((s) => {
    const { avgMinutes, avgComfort } = averageStopoverTransfer(s);
    const durationPenalty = Math.max(0, avgMinutes - 45) * 0.5;
    return clamp(100 - durationPenalty + (avgComfort - 3) * 8);
  });
  return mean(perStop);
}

function deriveDuration(journey: Journey, signals: JourneyScoreSignals): number | null {
  const reference = signals.referenceDurationMinutes;
  if (typeof reference !== 'number' || !(journey.totalTravelTimeMinutes > 0)) return null;
  const ratio = clamp01(reference / journey.totalTravelTimeMinutes);
  return clamp(100 * Math.pow(ratio, 1.2));
}

function deriveJetLag(journey: Journey, signals: JourneyScoreSignals): number | null {
  const originTz = signals.origin.tzOffsetHours;
  const destTz = signals.destination.tzOffsetHours;
  if (typeof originTz !== 'number' || typeof destTz !== 'number') return null;

  // Wrap the offset difference across the date line to the shorter way round:
  // the circadian shift SYD(+10)→JFK(−5) is 9h eastward, not 15h. `signedDelta`
  // in (−12, 12]; its sign gives the effective travel direction after wrapping.
  let signedDelta = destTz - originTz;
  while (signedDelta > 12) signedDelta -= 24;
  while (signedDelta <= -12) signedDelta += 24;

  const magnitude = Math.abs(signedDelta);
  const dirFactor = signedDelta > 0 ? 1.3 : 1.0; // eastward shifts are harder
  let raw = magnitude * 9 * dirFactor;

  const totalStopoverNights = journey.stopovers.reduce((sum, s) => sum + s.nights, 0);
  raw -= Math.min(totalStopoverNights, 2) * 8;

  return clamp(100 - Math.max(0, raw));
}

function deriveAirportQuality(journey: Journey, signals: JourneyScoreSignals): number | null {
  const values: number[] = [];
  if (typeof signals.origin.airportQuality === 'number') {
    values.push(signals.origin.airportQuality);
  }
  for (const cityScore of signals.stopovers.slice(0, journey.stopovers.length)) {
    if (typeof cityScore.airportQuality === 'number') values.push(cityScore.airportQuality);
  }
  if (typeof signals.destination.airportQuality === 'number') {
    values.push(signals.destination.airportQuality);
  }
  return mean(values);
}

function deriveTouristAppeal(journey: Journey, signals: JourneyScoreSignals): number | null {
  return stopoverOrDest(journey, signals, (s) => s.touristAppeal);
}

function deriveNeighbourhoodQuality(journey: Journey, signals: JourneyScoreSignals): number | null {
  return stopoverOrDest(journey, signals, (s) => s.neighbourhoodQuality);
}

function deriveFoodRating(journey: Journey, signals: JourneyScoreSignals): number | null {
  return stopoverOrDest(journey, signals, (s) => s.foodRating);
}

function deriveSafety(journey: Journey, signals: JourneyScoreSignals): number | null {
  return stopoverOrDest(journey, signals, (s) => s.safety);
}

export function deriveJourneyScoreFactors(
  journey: Journey,
  signals: JourneyScoreSignals,
): JourneyScoreFactors {
  return {
    cost: deriveCost(journey),
    cabinQuality: deriveCabinQuality(journey),
    hotelQuality: deriveHotelQuality(journey),
    weather: deriveWeather(journey, signals),
    transfers: deriveTransfers(journey),
    duration: deriveDuration(journey, signals),
    jetLag: deriveJetLag(journey, signals),
    airportQuality: deriveAirportQuality(journey, signals),
    touristAppeal: deriveTouristAppeal(journey, signals),
    neighbourhoodQuality: deriveNeighbourhoodQuality(journey, signals),
    foodRating: deriveFoodRating(journey, signals),
    safety: deriveSafety(journey, signals),
  };
}
