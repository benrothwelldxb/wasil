/**
 * RouteCraft domain types — the single source of truth for journey shapes.
 *
 * This module is PURE: it imports nothing from `data/`, `features/`, `stores/`,
 * or React. Zod schemas in `schemas.ts` validate these shapes at boundaries.
 */

// ——— shared primitives ———
export type IATACode = string; // 3-letter, validated by Zod
export type ISODateString = string; // 'YYYY-MM-DD'
export type ISODateTimeString = string; // full ISO 8601 with offset
export type Minutes = number;

export type Currency = 'USD';
export interface Money {
  amount: number;
  currency: Currency;
}

export type CabinClass = 'economy' | 'premium_economy' | 'business';

export type TravelPreference =
  | 'culture'
  | 'food'
  | 'nightlife'
  | 'nature'
  | 'shopping'
  | 'relaxation'
  | 'family'
  | 'speed'
  | 'comfort';

// ——— search input ———
export interface Pax {
  adults: number; // 1–9
  children: number; // 0–6
}

export interface SearchCriteria {
  origin: IATACode;
  destination: IATACode;
  departureDate: ISODateString;
  returnDate?: ISODateString;
  pax: Pax;
  budget: Money; // TOTAL trip budget, all pax, hard cap
  cabin: CabinClass;
  preferences: TravelPreference[]; // 0–3 selections
  maxStopovers: 0 | 1 | 2; // default 2
  minStopoverNights: 1; // fixed v1
  maxStopoverNights: 1 | 2 | 3; // default 2
}

// ——— journey composition ———
export interface AirportRef {
  iata: IATACode;
  cityName: string;
  countryCode: string;
}

export interface Airline {
  code: string;
  name: string;
  comfortRating: number; // 1–5
}

export interface Leg {
  id: string;
  from: AirportRef;
  to: AirportRef;
  departure: ISODateTimeString;
  arrival: ISODateTimeString;
  durationMinutes: Minutes;
  airline: Airline;
  flightNumber: string;
  cabin: CabinClass;
  aircraft: string;
  isRedEye: boolean; // departs 21:00–02:59 local
  pricePerPax: Money;
}

export type HotelTier = 'budget' | 'midscale' | 'upscale';

export interface HotelOption {
  id: string;
  name: string;
  tier: HotelTier;
  starRating: 3 | 4 | 5;
  guestRating: number; // 6.0–9.8
  neighborhood: string;
  pricePerNight: Money; // per room
  totalPrice: Money;
  amenities: string[];
}

export type TransferMode = 'metro' | 'train' | 'taxi' | 'shuttle';

export interface Transfer {
  id: string;
  mode: TransferMode;
  from: string;
  to: string;
  durationMinutes: Minutes;
  price: Money; // total for party
  comfortRating: number; // 1–5
}

export interface StopoverCity {
  airport: AirportRef;
  cityName: string;
  countryCode: string;
  nights: number; // 1–3
  appealScore: number; // 0–100, curated per city
  tags: TravelPreference[];
  headline: string;
  highlights: string[];
  visaNote?: string;
  hotel: HotelOption; // the selected option
  alternativeHotels: HotelOption[];
  transfers: { arrival: Transfer; departure: Transfer };
}

export interface CostBreakdown {
  flights: Money;
  hotels: Money;
  transfers: Money;
  total: Money;
  perPerson: Money;
  budget: Money;
  headroom: Money; // budget − total (≥ 0 by hard constraint)
  headroomPct: number; // headroom / budget, 0–1
}

export interface ExperienceFactors {
  stopoverAppeal: number;
  comfort: number;
  travelTimeEfficiency: number;
  layoverQuality: number;
  valueForMoney: number;
  scheduleConvenience: number;
}

export type ExperienceFactorKey = keyof ExperienceFactors;

export interface ExperienceScore {
  total: number; // 0–100 composite
  factors: ExperienceFactors; // each 0–100
  weights: Record<ExperienceFactorKey, number>; // effective weights, sum = 1
  narrative: string;
}

export type JourneyKind = 'direct' | 'stopover';
export type JourneyBadge = 'best-experience' | 'fastest' | 'best-value' | 'hidden-gem';

export interface Journey {
  id: string;
  kind: JourneyKind;
  criteria: SearchCriteria;
  legs: Leg[];
  stopovers: StopoverCity[]; // [] for direct
  totalTravelTimeMinutes: Minutes; // first dep → final arr, excluding stopover nights
  doorToDoorMinutes: Minutes; // including stopover nights
  cost: CostBreakdown;
  score: ExperienceScore;
  badges: JourneyBadge[];
}

export interface SearchStats {
  candidatesConsidered: number;
  overBudgetFiltered: number;
  cheapestOverBudget?: Money; // cheapest total that busted the budget, if any
}

export interface SearchResult {
  criteria: SearchCriteria;
  journeys: Journey[]; // ranked desc by score.total
  generatedAt: ISODateTimeString;
  providerId: string;
  stats: SearchStats;
}
