/**
 * A hand-built, fully static provider — a testing double and last-ditch
 * fallback. Its journeys are literal objects (not generated), but cost and score
 * are computed through the real domain functions so every result still passes
 * `journeySchema` / `searchResultSchema`.
 */
import type {
  ExperienceScore,
  Journey,
  JourneyKind,
  Leg,
  SearchCriteria,
  SearchResult,
  StopoverCity,
} from '@/domain/types';
import { computeCostBreakdown, effectiveWeights, rankJourneys } from '@/domain/scoring';
import { searchResultSchema } from '@/domain/schemas';
import type { JourneyProvider } from './JourneyProvider';

const FIXED_CRITERIA: SearchCriteria = {
  origin: 'LHR',
  destination: 'JFK',
  departureDate: '2026-09-15',
  pax: { adults: 1, children: 0 },
  budget: { amount: 3000, currency: 'USD' },
  cabin: 'economy',
  preferences: ['culture'],
  maxStopovers: 1,
  minStopoverNights: 1,
  maxStopoverNights: 2,
};

const spanMinutes = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);

const PLACEHOLDER_SCORE = (criteria: SearchCriteria): ExperienceScore => ({
  total: 0,
  factors: {
    stopoverAppeal: 0,
    comfort: 0,
    travelTimeEfficiency: 0,
    layoverQuality: 0,
    valueForMoney: 0,
    scheduleConvenience: 0,
  },
  weights: effectiveWeights(criteria.preferences),
  narrative: '',
});

function assemble(
  id: string,
  kind: JourneyKind,
  legs: Leg[],
  stopovers: StopoverCity[],
): Journey {
  const cost = computeCostBreakdown({
    legs,
    stopovers,
    pax: FIXED_CRITERIA.pax,
    budget: FIXED_CRITERIA.budget,
  });
  return {
    id,
    kind,
    criteria: FIXED_CRITERIA,
    legs,
    stopovers,
    totalTravelTimeMinutes: legs.reduce((s, l) => s + l.durationMinutes, 0),
    doorToDoorMinutes: spanMinutes(legs[0].departure, legs[legs.length - 1].arrival),
    cost,
    score: PLACEHOLDER_SCORE(FIXED_CRITERIA),
    badges: [],
  };
}

const directLeg: Leg = {
  id: 'fake-direct-l1',
  from: { iata: 'LHR', cityName: 'London', countryCode: 'GB' },
  to: { iata: 'JFK', cityName: 'New York', countryCode: 'US' },
  departure: '2026-09-15T11:00:00.000Z',
  arrival: '2026-09-15T18:30:00.000Z',
  durationMinutes: 450,
  airline: { code: 'MR', name: 'Meridian Air', comfortRating: 4 },
  flightNumber: 'MR417',
  cabin: 'economy',
  aircraft: 'Boeing 777-300ER',
  isRedEye: false,
  pricePerPax: { amount: 640, currency: 'USD' },
};

const stopLeg1: Leg = {
  id: 'fake-stop-l1',
  from: { iata: 'LHR', cityName: 'London', countryCode: 'GB' },
  to: { iata: 'KEF', cityName: 'Reykjavik', countryCode: 'IS' },
  departure: '2026-09-15T09:00:00.000Z',
  arrival: '2026-09-15T12:20:00.000Z',
  durationMinutes: 200,
  airline: { code: 'NS', name: 'Nordic Skyways', comfortRating: 5 },
  flightNumber: 'NS812',
  cabin: 'economy',
  aircraft: 'Airbus A321neo',
  isRedEye: false,
  pricePerPax: { amount: 330, currency: 'USD' },
};

const stopLeg2: Leg = {
  id: 'fake-stop-l2',
  from: { iata: 'KEF', cityName: 'Reykjavik', countryCode: 'IS' },
  to: { iata: 'JFK', cityName: 'New York', countryCode: 'US' },
  departure: '2026-09-16T10:00:00.000Z',
  arrival: '2026-09-16T15:40:00.000Z',
  durationMinutes: 340,
  airline: { code: 'NS', name: 'Nordic Skyways', comfortRating: 5 },
  flightNumber: 'NS440',
  cabin: 'economy',
  aircraft: 'Boeing 787-9 Dreamliner',
  isRedEye: false,
  pricePerPax: { amount: 360, currency: 'USD' },
};

const reykjavikStopover: StopoverCity = {
  airport: { iata: 'KEF', cityName: 'Reykjavik', countryCode: 'IS' },
  cityName: 'Reykjavik',
  countryCode: 'IS',
  nights: 1,
  appealScore: 86,
  tags: ['nature'],
  headline: 'Volcanoes, geysers and the northern lights',
  highlights: [
    'Golden Circle loop: Þingvellir, Geysir, Gullfoss',
    'A float in the Blue Lagoon between flights',
    'Black-sand beaches at Reynisfjara',
  ],
  hotel: {
    id: 'fake-htl-mid',
    name: 'Parkview Hotel Waterfront',
    tier: 'midscale',
    starRating: 4,
    guestRating: 8.3,
    neighborhood: 'Waterfront',
    pricePerNight: { amount: 205, currency: 'USD' },
    totalPrice: { amount: 205, currency: 'USD' },
    amenities: ['Free Wi-Fi', 'Breakfast included', 'Fitness center'],
  },
  alternativeHotels: [
    {
      id: 'fake-htl-budget',
      name: 'CityLodge Downtown',
      tier: 'budget',
      starRating: 3,
      guestRating: 7.4,
      neighborhood: 'Downtown',
      pricePerNight: { amount: 128, currency: 'USD' },
      totalPrice: { amount: 128, currency: 'USD' },
      amenities: ['Free Wi-Fi', '24-hour reception'],
    },
    {
      id: 'fake-htl-upscale',
      name: 'The Regent Old Town',
      tier: 'upscale',
      starRating: 5,
      guestRating: 9.1,
      neighborhood: 'Old Town',
      pricePerNight: { amount: 338, currency: 'USD' },
      totalPrice: { amount: 338, currency: 'USD' },
      amenities: ['Free Wi-Fi', 'Spa & wellness', '24-hour concierge'],
    },
  ],
  transfers: {
    arrival: {
      id: 'fake-xfer-arr',
      mode: 'shuttle',
      from: 'KEF Airport',
      to: 'Reykjavik city centre',
      durationMinutes: 55,
      price: { amount: 24, currency: 'USD' },
      comfortRating: 3,
    },
    departure: {
      id: 'fake-xfer-dep',
      mode: 'taxi',
      from: 'Reykjavik city centre',
      to: 'KEF Airport',
      durationMinutes: 50,
      price: { amount: 46, currency: 'USD' },
      comfortRating: 5,
    },
  },
};

function buildStaticResult(): SearchResult {
  const journeys: Journey[] = [
    assemble('fake-direct', 'direct', [directLeg], []),
    assemble('fake-stopover', 'stopover', [stopLeg1, stopLeg2], [reykjavikStopover]),
  ];
  const ranked = rankJourneys(journeys, FIXED_CRITERIA);
  return searchResultSchema.parse({
    criteria: FIXED_CRITERIA,
    journeys: ranked,
    generatedAt: '2026-09-15T00:00:00.000Z',
    providerId: 'fake-static',
    stats: { candidatesConsidered: ranked.length, overBudgetFiltered: 0 },
  });
}

export class FakeStaticProvider implements JourneyProvider {
  readonly id = 'fake-static';

  async searchJourneys(): Promise<SearchResult> {
    return buildStaticResult();
  }

  async getJourney(journeyId: string): Promise<Journey | null> {
    return buildStaticResult().journeys.find((j) => j.id === journeyId) ?? null;
  }
}

export const fakeStaticProvider = new FakeStaticProvider();
