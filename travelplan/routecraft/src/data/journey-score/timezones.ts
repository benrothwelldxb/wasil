/**
 * Curated standard (non-DST) UTC offsets in hours for the cities in the dataset,
 * so the Journey Score's jet-lag factor has real data to work with. Kept here in
 * the journey-score data layer rather than bloating the shared city dataset;
 * unknown IATA codes return undefined and the factor drops out gracefully.
 */
const UTC_OFFSET_HOURS: Readonly<Record<string, number>> = {
  // Middle East
  DXB: 4,
  DOH: 3,
  IST: 3,
  CAI: 2,
  // Europe (Western/Central/Eastern)
  LHR: 0,
  MAN: 0,
  KEF: 0,
  LIS: 0,
  CDG: 1,
  AMS: 1,
  FRA: 1,
  ZRH: 1,
  VIE: 1,
  MAD: 1,
  FCO: 1,
  ATH: 2,
  HEL: 2,
  // Asia-Pacific
  BKK: 7,
  SIN: 8,
  KUL: 8,
  NRT: 9,
  SYD: 10,
  // Americas
  JFK: -5,
  YYZ: -5,
};

export function getUtcOffsetHours(iata: string): number | undefined {
  return UTC_OFFSET_HOURS[iata];
}
