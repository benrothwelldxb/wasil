/**
 * Stopover discovery engine — contracts (Opus design; Sonnet implements bodies).
 *
 * PURE domain: this module and its siblings import nothing from `data/`, React,
 * or datasets. The city pool and the flight/hotel ports are dependency-injected,
 * which is what makes the algorithm testable and lets an AI recommender replace
 * the heuristic without touching the orchestrator. See ALGORITHM.md.
 */
import type {
  CabinClass,
  HotelOption,
  IATACode,
  ISODateString,
  Journey,
  Leg,
  Money,
  Pax,
  StopoverCity,
  TravelPreference,
} from '@/domain/types';

/** Inputs to a discovery run. */
export interface DiscoveryRequest {
  origin: IATACode;
  destination: IATACode;
  /** 0 = direct only (skip candidate discovery); 1–2 = allow stopovers. */
  maxStopovers: 0 | 1 | 2;
  maxStopoverNights: 1 | 2 | 3;
  budget: Money;
  departureDate: ISODateString;
  pax: Pax;
  cabin: CabinClass;
  preferences: TravelPreference[];
}

/**
 * A candidate stopover city. Geo + editorial signal, injected so the algorithm
 * never imports the dataset. `hotelBaseNightly` feeds the cheap shortlist estimate.
 */
export interface CandidateCity {
  iata: IATACode;
  cityName: string;
  countryCode: string;
  lat: number;
  lon: number;
  hubStrength: number; // 1..5
  appealScore: number; // 0..100
  tags: TravelPreference[];
  hotelBaseNightly: Money;
  // Editorial copy carried through into the constructed StopoverCity.
  headline: string;
  highlights: string[];
  visaNote?: string;
}

export type RecommendationSource = 'heuristic' | 'ai';

/**
 * A scored candidate. `rationale`/`confidence` are populated by a future AI
 * recommender and ignored by the heuristic; the engine verifies every
 * recommendation with real flight/hotel/cost math regardless of source.
 */
export interface StopoverRecommendation {
  city: CandidateCity;
  nights: number; // n* from nights optimisation, 1..maxStopoverNights
  score: number; // candidateScore, 0..1
  estimatedTotal: Money; // cheap estimate used for shortlisting
  source: RecommendationSource;
  rationale?: string;
  confidence?: number; // 0..1
}

/** The AI-swappable seam: heuristic today, AI later, same signature. */
export interface CandidateRecommender {
  readonly id: string;
  recommend(
    request: DiscoveryRequest,
    cityPool: readonly CandidateCity[],
  ): Promise<StopoverRecommendation[]>;
}

// ——— construction ports (implemented by the synthetic/data layer) ———

export interface FlightSearchRequest {
  from: IATACode;
  to: IATACode;
  date: ISODateString;
  cabin: CabinClass;
  pax: Pax;
}

export interface FlightSearchPort {
  /** Returns candidate legs for the segment; the engine picks the best. */
  search(req: FlightSearchRequest, opts?: { signal?: AbortSignal }): Promise<Leg[]>;
}

export interface HotelEstimateRequest {
  city: CandidateCity;
  nights: number;
  rooms: number;
  date: ISODateString;
}

export interface HotelEstimateResult {
  hotel: HotelOption;
  alternativeHotels: HotelOption[];
  transfers: StopoverCity['transfers'];
}

export interface HotelEstimatorPort {
  estimate(req: HotelEstimateRequest, opts?: { signal?: AbortSignal }): Promise<HotelEstimateResult>;
}

/** Everything the orchestrator needs, injected. */
export interface DiscoveryDeps {
  recommender: CandidateRecommender;
  cityPool: readonly CandidateCity[];
  flightSearch: FlightSearchPort;
  hotelEstimator: HotelEstimatorPort;
  /** Clock for `generatedAt` only; defaults to a fixed epoch for determinism. */
  now?: () => number;
}

export interface DiscoveryDiagnostics {
  citiesConsidered: number;
  gated: number; // passed the hard gates
  shortlisted: number; // fully constructed
  overBudgetFiltered: number;
  cheapestOverBudget?: Money;
  recommenderId: string;
}

export interface DiscoveryResult {
  request: DiscoveryRequest;
  /** Ranked desc by experience; includes the direct baseline journey. */
  journeys: Journey[];
  diagnostics: DiscoveryDiagnostics;
}

/** Algorithm constants (pinned by the Opus design — see ALGORITHM.md). */
export const MAX_DETOUR = 1.6;
export const RECOMMEND_LIMIT = 8;
export const CANDIDATE_WEIGHTS = {
  routeEfficiency: 0.3,
  hubViability: 0.2,
  appeal: 0.3,
  budgetFit: 0.2,
} as const;
export const NIGHTS_FACTOR: Readonly<Record<number, number>> = { 1: 0.85, 2: 1.0, 3: 0.95 };
export const BUDGET_SWEET_SPOT = { lo: 0.55, hi: 0.85 } as const;
