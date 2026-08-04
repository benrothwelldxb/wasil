/**
 * Generic, provider-agnostic accommodation model for a stopover.
 *
 * This is THE public hotel contract. Provider-specific wire shapes live behind
 * adapters in `src/data/hotels/**` and are never exported or referenced above
 * the data layer — the rest of the app sees only `StopoverAccommodation` and the
 * `HotelProvider` interface. Swapping a real hotel API in is a new adapter +
 * normaliser, with zero changes upstream.
 */
import type { HotelOption, ISODateString, Money, Pax, TransferMode } from '@/domain/types';

export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'snowy';

export interface WeatherSummary {
  condition: WeatherCondition;
  averageHighC: number;
  averageLowC: number;
  precipitationChance: number; // 0..1
}

export interface AirportTransferSummary {
  mode: TransferMode;
  durationMinutes: number;
  price: Money; // total for the party
  comfortRating: number; // 1..5
}

/**
 * Everything computed "for every stopover": average hotel price, walking score,
 * airport transfer, neighbourhood rating, safety, weather, total accommodation
 * cost — plus the generic hotel options themselves.
 */
export interface StopoverAccommodation {
  cityIata: string;
  cityName: string;
  countryCode: string;
  nights: number;
  rooms: number;
  /** Generic, provider-agnostic hotel options (the existing `HotelOption`). */
  hotels: HotelOption[];
  /** Average nightly room price across the sampled hotels. */
  averageNightlyPrice: Money;
  /** averageNightlyPrice × rooms × nights. */
  totalAccommodationCost: Money;
  walkingScore: number; // 0..100
  neighbourhoodRating: number; // 0..5
  safetyScore: number; // 0..100
  weather: WeatherSummary;
  airportTransfer: AirportTransferSummary;
  /** Internal telemetry only — never rendered as provider identity in the UI. */
  providerId: string;
}

export interface HotelSearchRequest {
  cityIata: string;
  nights: number;
  pax: Pax;
  date: ISODateString;
}

/** The generic hotel interface. Real providers implement this behind an adapter. */
export interface HotelProvider {
  readonly id: string;
  getAccommodation(
    req: HotelSearchRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<StopoverAccommodation>;
}
