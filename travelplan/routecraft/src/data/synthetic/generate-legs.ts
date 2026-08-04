/**
 * Leg construction and the deterministic clock. All times are UTC ISO strings
 * derived from `departureDate` plus seeded offsets — the real wall clock is
 * never read during generation, which keeps output reproducible and aligns with
 * the UTC-hour assumptions in the scoring layer.
 */
import type { AirportRef, CabinClass, Leg } from '@/domain/types';
import { estimateFlightMinutes, haversineKm } from '@/domain/geo';
import type { City } from '@/data/datasets/cities';
import { AIRCRAFT_TYPES, AIRLINES } from '@/data/datasets/airlines';
import { priceAdultFare } from './pricing';
import { toBase36Id, type Rng } from './rng';

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Build a UTC ISO timestamp at `hour:minute` on the given `YYYY-MM-DD` date. */
export function isoAt(dateStr: string, hour: number, minute: number): string {
  return `${dateStr}T${pad2(hour)}:${pad2(minute)}:00.000Z`;
}

/** Add whole days to a `YYYY-MM-DD` date string, returning `YYYY-MM-DD`. */
export function addDays(dateStr: string, days: number): string {
  const base = Date.parse(`${dateStr}T00:00:00.000Z`);
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Add minutes to an ISO timestamp, returning a UTC ISO timestamp. */
export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * MS_PER_MIN).toISOString();
}

/** Whole minutes between two ISO timestamps. */
export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_MIN);
}

/** UTC hour (0–23) of an ISO timestamp. */
export function utcHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

/** Red-eye = departs 21:00–02:59. */
export function isRedEyeHour(hour: number): boolean {
  return hour >= 21 || hour < 3;
}

export function toAirportRef(city: City): AirportRef {
  return { iata: city.iata, cityName: city.cityName, countryCode: city.countryCode };
}

export type TimeOfDay = 'morning' | 'evening';

/**
 * Re-departure time after an overnight stay: `nights` calendar days after the
 * arrival date, at a seeded morning or evening hour. Because `nights >= 1`, the
 * result is always safely after the arrival, keeping the connection feasible.
 */
export function reDepartAfter(
  arrivalISO: string,
  nights: number,
  timeOfDay: TimeOfDay,
  rng: Rng,
): string {
  const departDate = addDays(arrivalISO.slice(0, 10), nights);
  const hour = timeOfDay === 'morning' ? rng.randInt(9, 12) : rng.randInt(17, 20);
  return isoAt(departDate, hour, rng.randInt(0, 55));
}

export interface MakeLegInput {
  from: City;
  to: City;
  departISO: string;
  cabin: CabinClass;
  throughFare: boolean;
  idSeed: string;
  rng: Rng;
}

export interface MadeLeg {
  leg: Leg;
  arrivalISO: string;
}

/** Construct a single leg with seeded airline, aircraft, fare, and timing. */
export function makeLeg({
  from,
  to,
  departISO,
  cabin,
  throughFare,
  idSeed,
  rng,
}: MakeLegInput): MadeLeg {
  const km = haversineKm(from, to);
  const durationMinutes = estimateFlightMinutes(km);
  const arrivalISO = addMinutes(departISO, durationMinutes);
  const depHour = utcHour(departISO);
  const isRedEye = isRedEyeHour(depHour);

  // Prefer more comfortable carriers, weighted by their comfort rating.
  const airline = rng.weighted(AIRLINES.map((a) => [a, a.comfortRating] as const));
  const aircraft = rng.pick(AIRCRAFT_TYPES);
  const flightNumber = `${airline.code}${rng.randInt(100, 1999)}`;

  const adultFare = priceAdultFare({
    km,
    cabin,
    priceFactor: airline.priceFactor,
    isRedEye,
    throughFare,
    rng,
  });

  const leg: Leg = {
    id: toBase36Id(`${idSeed}|leg|${from.iata}|${to.iata}`),
    from: toAirportRef(from),
    to: toAirportRef(to),
    departure: departISO,
    arrival: arrivalISO,
    durationMinutes,
    airline: { code: airline.code, name: airline.name, comfortRating: airline.comfortRating },
    flightNumber,
    cabin,
    aircraft,
    isRedEye,
    pricePerPax: { amount: adultFare, currency: 'USD' },
  };

  return { leg, arrivalISO };
}
