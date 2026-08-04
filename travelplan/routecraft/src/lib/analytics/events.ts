/**
 * Analytics event taxonomy — the search → select → intent funnel.
 *
 * These are the first vertebra of the learning flywheel (see
 * docs/reviews/architecture-debate.md): the engagement signal a future ranker
 * trains on. Payloads are deliberately PII-free — no names, emails, or free
 * text. `providerId` is internal telemetry only and is never rendered in the UI.
 */
import type {
  CabinClass,
  JourneyBadge,
  JourneyKind,
  TravelPreference,
} from '@/domain/types';

export interface SearchSubmittedEvent {
  name: 'search_submitted';
  origin: string;
  destination: string;
  maxStopovers: 0 | 1 | 2;
  maxStopoverNights: 1 | 2 | 3;
  budgetUsd: number;
  travellers: number;
  cabin: CabinClass;
  preferences: TravelPreference[];
}

export interface SearchCompletedEvent {
  name: 'search_completed';
  providerId: string; // internal telemetry only
  journeyCount: number;
  hasStopover: boolean;
  topScore: number | null;
}

export interface JourneySelectedEvent {
  name: 'journey_selected';
  journeyId: string;
  rank: number; // 0-based position in the ranked list
  kind: JourneyKind;
  score: number;
  badges: JourneyBadge[];
}

export interface JourneyViewedEvent {
  name: 'journey_viewed';
  journeyId: string;
  kind: JourneyKind;
  score: number;
}

export interface HotelSwappedEvent {
  name: 'hotel_swapped';
  journeyId: string;
  cityIata: string;
}

export interface BookingIntentEvent {
  name: 'booking_intent';
  journeyId: string;
  kind: JourneyKind;
  totalUsd: number;
}

/** Discriminated union of every analytics event, keyed by `name`. */
export type AnalyticsEvent =
  | SearchSubmittedEvent
  | SearchCompletedEvent
  | JourneySelectedEvent
  | JourneyViewedEvent
  | HotelSwappedEvent
  | BookingIntentEvent;

export type AnalyticsEventName = AnalyticsEvent['name'];
