/**
 * Fictional carrier roster. Names and two-letter codes are invented — no real
 * airline branding. `priceFactor` scales the base fare; `comfortRating` feeds
 * the comfort factor in scoring.
 */

export interface AirlineRecord {
  code: string; // 2-letter, fictional
  name: string;
  comfortRating: number; // 1–5
  priceFactor: number; // 0.85–1.25
}

export const AIRLINES: AirlineRecord[] = [
  { code: 'MR', name: 'Meridian Air', comfortRating: 4, priceFactor: 1.05 },
  { code: 'BP', name: 'Bosphorus Airways', comfortRating: 4, priceFactor: 1.1 },
  { code: 'AP', name: 'Atlas Pacific', comfortRating: 3, priceFactor: 0.92 },
  { code: 'NS', name: 'Nordic Skyways', comfortRating: 5, priceFactor: 1.2 },
  { code: 'ZC', name: 'Azure Continental', comfortRating: 4, priceFactor: 1.08 },
  { code: 'CW', name: 'Cedar Wings', comfortRating: 3, priceFactor: 0.95 },
  { code: 'SO', name: 'Solstice Air', comfortRating: 3, priceFactor: 0.9 },
  { code: 'VM', name: 'Vermillion Airlines', comfortRating: 4, priceFactor: 1.12 },
  { code: 'HC', name: 'Halcyon Air', comfortRating: 5, priceFactor: 1.25 },
  { code: 'ZJ', name: 'Zephyr Jet', comfortRating: 2, priceFactor: 0.85 },
  { code: 'CG', name: 'Corsair Global', comfortRating: 3, priceFactor: 0.98 },
  { code: 'AU', name: 'Aurora Líneas', comfortRating: 4, priceFactor: 1.06 },
  { code: 'SB', name: 'Sable Air', comfortRating: 2, priceFactor: 0.88 },
  { code: 'KS', name: 'Kestrel Airways', comfortRating: 3, priceFactor: 0.94 },
  { code: 'OX', name: 'Onyx Atlantic', comfortRating: 4, priceFactor: 1.15 },
];

/** A small aircraft-type pool, assigned per leg for flavour. */
export const AIRCRAFT_TYPES: string[] = [
  'Airbus A320neo',
  'Airbus A321neo',
  'Airbus A330-300',
  'Airbus A350-900',
  'Boeing 737 MAX 8',
  'Boeing 787-9 Dreamliner',
  'Boeing 777-300ER',
  'Embraer E195-E2',
];
