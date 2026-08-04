/** Pure geo helpers — no I/O, no randomness. */

const EARTH_RADIUS_KM = 6371;
/** Typical cruise speed used to estimate block time from great-circle distance. */
const CRUISE_KMH = 850;
/** Fixed overhead per flight (taxi, climb, descent), in minutes. */
const FLIGHT_OVERHEAD_MIN = 40;

export interface GeoPoint {
  lat: number;
  lon: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated flight block time (minutes) for a given distance in km. */
export function estimateFlightMinutes(distanceKm: number): number {
  return Math.round((distanceKm / CRUISE_KMH) * 60 + FLIGHT_OVERHEAD_MIN);
}

/**
 * Detour ratio for routing origin → hub → destination versus flying direct.
 * 1.0 means the hub is exactly on the great-circle path; higher means a detour.
 */
export function detourRatio(origin: GeoPoint, hub: GeoPoint, dest: GeoPoint): number {
  const direct = haversineKm(origin, dest);
  if (direct === 0) return Infinity;
  return (haversineKm(origin, hub) + haversineKm(hub, dest)) / direct;
}
