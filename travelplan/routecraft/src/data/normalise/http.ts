/**
 * Normalisation for the (hypothetical) HTTP flight-search provider. Maps the
 * snake_case, minor-unit wire shape onto domain types, recomputing cost from
 * `computeCostBreakdown` rather than trusting any wire-reported total —
 * money is USD-only in v1, so any offer priced in another currency is
 * dropped outright.
 */
import type {
  AirportRef,
  CabinClass,
  HotelOption,
  HotelTier,
  Journey,
  Leg,
  SearchResult,
  StopoverCity,
  Transfer,
  TransferMode,
  TravelPreference,
} from '@/domain/types';
import { journeySchema, TRAVEL_PREFERENCES } from '@/domain/schemas';
import { computeCostBreakdown, effectiveWeights, money } from '@/domain/scoring';
import { ProviderError } from '@/data/provider/errors';
import type {
  HttpRawAirport,
  HttpRawHotel,
  HttpRawOffer,
  HttpRawSearchResponse,
  HttpRawSlice,
  HttpRawStay,
  HttpRawTransfer,
} from './raw-types';
import type { NormaliseContext } from './normalise';

const MS_PER_MIN = 60_000;

const CABIN_MAP: Record<HttpRawSlice['cabin'], CabinClass> = {
  ECONOMY: 'economy',
  PREMIUM_ECONOMY: 'premium_economy',
  BUSINESS: 'business',
};

const HOTEL_TIER_MAP: Record<HttpRawHotel['tier'], HotelTier> = {
  BUDGET: 'budget',
  MIDSCALE: 'midscale',
  UPSCALE: 'upscale',
};

const TRANSFER_MODE_MAP: Record<HttpRawTransfer['mode'], TransferMode> = {
  METRO: 'metro',
  TRAIN: 'train',
  TAXI: 'taxi',
  SHUTTLE: 'shuttle',
};

const TRAVEL_PREFERENCE_SET: ReadonlySet<string> = new Set(TRAVEL_PREFERENCES);

function mapAirport(a: HttpRawAirport): AirportRef {
  return { iata: a.code, cityName: a.city, countryCode: a.country };
}

function mapLeg(slice: HttpRawSlice): Leg {
  return {
    id: slice.slice_id,
    from: mapAirport(slice.origin),
    to: mapAirport(slice.dest),
    departure: slice.depart_at,
    arrival: slice.arrive_at,
    durationMinutes: slice.duration_min,
    airline: {
      code: slice.marketing_carrier.code,
      name: slice.marketing_carrier.name,
      comfortRating: slice.marketing_carrier.comfort_1to5,
    },
    flightNumber: slice.flight_no,
    cabin: CABIN_MAP[slice.cabin],
    aircraft: slice.equipment,
    isRedEye: slice.red_eye,
    pricePerPax: money(slice.price_minor_per_pax / 100),
  };
}

function mapHotel(hotel: HttpRawHotel): HotelOption {
  return {
    id: hotel.hotel_id,
    name: hotel.name,
    tier: HOTEL_TIER_MAP[hotel.tier],
    starRating: hotel.stars,
    guestRating: hotel.guest_score_0to10,
    neighborhood: hotel.area,
    pricePerNight: money(hotel.nightly_minor / 100),
    totalPrice: money(hotel.total_minor / 100),
    amenities: hotel.amenities,
  };
}

function mapTransfer(transfer: HttpRawTransfer): Transfer {
  return {
    id: transfer.transfer_id,
    mode: TRANSFER_MODE_MAP[transfer.mode],
    from: transfer.from_label,
    to: transfer.to_label,
    durationMinutes: transfer.duration_min,
    price: money(transfer.total_minor / 100),
    comfortRating: transfer.comfort_1to5,
  };
}

function mapTags(tags: string[]): TravelPreference[] {
  return tags
    .map((t) => t.toLowerCase())
    .filter((t): t is TravelPreference => TRAVEL_PREFERENCE_SET.has(t));
}

function mapStopover(stay: HttpRawStay): StopoverCity {
  return {
    airport: mapAirport(stay.airport),
    cityName: stay.airport.city,
    countryCode: stay.airport.country,
    nights: stay.nights,
    appealScore: stay.appeal_0to100,
    tags: mapTags(stay.tags),
    headline: stay.headline,
    highlights: stay.highlights,
    ...(stay.visa_note !== undefined ? { visaNote: stay.visa_note } : {}),
    hotel: mapHotel(stay.hotel),
    alternativeHotels: stay.alternatives.map(mapHotel),
    transfers: {
      arrival: mapTransfer(stay.transfer_in),
      departure: mapTransfer(stay.transfer_out),
    },
  };
}

function doorToDoorMinutes(legs: Leg[]): number {
  const first = Date.parse(legs[0].departure);
  const last = Date.parse(legs[legs.length - 1].arrival);
  return Math.round((last - first) / MS_PER_MIN);
}

function buildJourney(offer: HttpRawOffer, ctx: NormaliseContext): Journey {
  const legs = offer.slices.map(mapLeg);
  const stopovers = offer.stays.map(mapStopover);

  const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  const cost = computeCostBreakdown({
    legs,
    stopovers,
    pax: ctx.criteria.pax,
    budget: ctx.criteria.budget,
  });

  return {
    id: `http-${offer.offer_id}`,
    kind: stopovers.length > 0 ? 'stopover' : 'direct',
    criteria: ctx.criteria,
    legs,
    stopovers,
    totalTravelTimeMinutes,
    doorToDoorMinutes: doorToDoorMinutes(legs),
    cost,
    score: {
      total: 0,
      factors: {
        stopoverAppeal: 0,
        comfort: 0,
        travelTimeEfficiency: 0,
        layoverQuality: 0,
        valueForMoney: 0,
        scheduleConvenience: 0,
      },
      weights: effectiveWeights(ctx.criteria.preferences),
      narrative: '',
    },
    badges: [],
  };
}

export function normaliseHttp(raw: HttpRawSearchResponse, ctx: NormaliseContext): SearchResult {
  if (raw.offers.length === 0) {
    throw new ProviderError('NO_ROUTES', `HTTP provider returned zero offers for search ${raw.search_id}.`);
  }

  const journeys: Journey[] = [];

  if (raw.currency !== 'USD') {
    // Money is USD-only in v1 — every offer in this response shares the one
    // response-level currency, so this drops all of them. Logged once for
    // the whole response rather than once per offer.
    ctx.logger.warn('dropped all offers: unsupported currency', {
      source: 'http-v1',
      searchId: raw.search_id,
      currency: raw.currency,
      offerCount: raw.offers.length,
    });
  } else {
    for (const offer of raw.offers) {
      const journey = buildJourney(offer, ctx);
      const parsed = journeySchema.safeParse(journey);
      if (!parsed.success) {
        ctx.logger.warn('dropped invalid journey', {
          source: 'http-v1',
          id: journey.id,
          issueCount: parsed.error.issues.length,
        });
        continue;
      }
      journeys.push(parsed.data);
    }
  }

  if (journeys.length === 0) {
    throw new ProviderError(
      'PROVIDER_FAILURE',
      `HTTP provider offers all failed validation for search ${raw.search_id}.`,
    );
  }

  return {
    criteria: ctx.criteria,
    journeys,
    generatedAt: raw.generated_at,
    providerId: 'http-v1',
    stats: {
      candidatesConsidered: raw.meta.candidates,
      overBudgetFiltered: raw.meta.over_budget,
      ...(raw.meta.cheapest_over_budget_minor != null
        ? { cheapestOverBudget: money(raw.meta.cheapest_over_budget_minor / 100) }
        : {}),
    },
  };
}
