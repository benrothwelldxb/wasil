/**
 * Shared raw-payload fixtures for the data layer's test suites
 * (`normalise`, `adapters`, `FlightEngine`). Every builder here produces
 * REALISTIC, schema-plausible data for a single canonical search — DXB → MAN,
 * one adult, USD — so cost math (`computeCostBreakdown`) lands comfortably
 * within the fixture's own budget and the resulting journeys are always
 * `journeySchema`-valid unless a helper deliberately breaks one field.
 */
import type { SearchCriteria } from '@/domain/types';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';
import type {
  HttpRawHotel,
  HttpRawOffer,
  HttpRawSearchResponse,
  HttpRawSlice,
  HttpRawTransfer,
  SyntheticRawPayload,
} from '@/data/normalise';
import type { Logger } from '@/lib/logger';

// ——— criteria ———

/** The canonical criteria every fixture in this module is priced against. */
export function sampleCriteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    origin: 'DXB',
    destination: 'MAN',
    departureDate: '2026-09-15',
    pax: { adults: 1, children: 0 },
    budget: { amount: 1500, currency: 'USD' },
    cabin: 'economy',
    preferences: ['culture'],
    maxStopovers: 2,
    minStopoverNights: 1,
    maxStopoverNights: 2,
    ...overrides,
  };
}

// ——— fake logger ———

/** Captures `warn`/`error` calls so tests can assert on them without touching `console`. */
export interface FakeLogger extends Logger {
  readonly calls: {
    debug: Array<{ msg: string; ctx?: Record<string, unknown> }>;
    info: Array<{ msg: string; ctx?: Record<string, unknown> }>;
    warn: Array<{ msg: string; ctx?: Record<string, unknown> }>;
    error: Array<{ msg: string; ctx?: Record<string, unknown> }>;
  };
}

export function createFakeLogger(): FakeLogger {
  const calls: FakeLogger['calls'] = { debug: [], info: [], warn: [], error: [] };
  const logger: FakeLogger = {
    calls,
    debug: (msg, ctx) => {
      calls.debug.push({ msg, ctx });
    },
    info: (msg, ctx) => {
      calls.info.push({ msg, ctx });
    },
    warn: (msg, ctx) => {
      calls.warn.push({ msg, ctx });
    },
    error: (msg, ctx) => {
      calls.error.push({ msg, ctx });
    },
    child: () => createFakeLogger(),
  };
  return logger;
}

// ——— HTTP raw wire fixtures ———

function slice(overrides: Partial<HttpRawSlice> & Pick<HttpRawSlice, 'slice_id'>): HttpRawSlice {
  return {
    origin: { code: 'DXB', city: 'Dubai', country: 'AE' },
    dest: { code: 'MAN', city: 'Manchester', country: 'GB' },
    depart_at: '2026-09-15T05:20:00Z',
    arrive_at: '2026-09-15T10:05:00Z',
    duration_min: 465,
    marketing_carrier: { code: 'EK', name: 'Emirates', comfort_1to5: 4 },
    flight_no: 'EK001',
    cabin: 'ECONOMY',
    equipment: 'B777',
    price_minor_per_pax: 42_000,
    red_eye: false,
    ...overrides,
  };
}

function hotel(overrides: Partial<HttpRawHotel> & Pick<HttpRawHotel, 'hotel_id'>): HttpRawHotel {
  return {
    name: 'Istanbul Bosphorus Hotel',
    tier: 'MIDSCALE',
    stars: 4,
    guest_score_0to10: 8.4,
    area: 'Sultanahmet',
    nightly_minor: 9_000,
    total_minor: 9_000,
    amenities: ['wifi', 'breakfast'],
    ...overrides,
  };
}

function transfer(
  overrides: Partial<HttpRawTransfer> & Pick<HttpRawTransfer, 'transfer_id'>,
): HttpRawTransfer {
  return {
    mode: 'METRO',
    from_label: 'IST Airport',
    to_label: 'Sultanahmet',
    duration_min: 40,
    total_minor: 1_500,
    comfort_1to5: 4,
    ...overrides,
  };
}

/** A direct DXB → MAN offer, no stopover. */
export function directOffer(overrides: Partial<HttpRawOffer> = {}): HttpRawOffer {
  return {
    offer_id: 'offer-direct-1',
    slices: [slice({ slice_id: 'slice-direct-1' })],
    stays: [],
    ...overrides,
  };
}

/** A second direct DXB → MAN offer (afternoon departure), for count/variety. */
export function directOfferAfternoon(overrides: Partial<HttpRawOffer> = {}): HttpRawOffer {
  return {
    offer_id: 'offer-direct-2',
    slices: [
      slice({
        slice_id: 'slice-direct-2',
        depart_at: '2026-09-15T13:00:00Z',
        arrive_at: '2026-09-15T17:55:00Z',
        duration_min: 475,
        marketing_carrier: { code: 'BA', name: 'British Airways', comfort_1to5: 3 },
        flight_no: 'BA109',
        equipment: 'A380',
        price_minor_per_pax: 47_500,
      }),
    ],
    stays: [],
    ...overrides,
  };
}

/** A one-stop DXB → IST → MAN offer with a 1-night Istanbul stopover. */
export function stopoverOffer(overrides: Partial<HttpRawOffer> = {}): HttpRawOffer {
  return {
    offer_id: 'offer-stop-ist',
    slices: [
      slice({
        slice_id: 'slice-stop-1',
        dest: { code: 'IST', city: 'Istanbul', country: 'TR' },
        depart_at: '2026-09-15T06:00:00Z',
        arrive_at: '2026-09-15T09:30:00Z',
        duration_min: 210,
        marketing_carrier: { code: 'TK', name: 'Turkish Airlines', comfort_1to5: 4 },
        flight_no: 'TK202',
        equipment: 'A321',
        price_minor_per_pax: 22_000,
      }),
      slice({
        slice_id: 'slice-stop-2',
        origin: { code: 'IST', city: 'Istanbul', country: 'TR' },
        depart_at: '2026-09-16T10:00:00Z',
        arrive_at: '2026-09-16T14:00:00Z',
        duration_min: 240,
        marketing_carrier: { code: 'TK', name: 'Turkish Airlines', comfort_1to5: 4 },
        flight_no: 'TK203',
        equipment: 'A321',
        price_minor_per_pax: 24_000,
      }),
    ],
    stays: [
      {
        airport: { code: 'IST', city: 'Istanbul', country: 'TR' },
        nights: 1,
        appeal_0to100: 82,
        // 'mystery-tag' is not a known TravelPreference — used to assert tag filtering.
        tags: ['culture', 'nightlife', 'mystery-tag'],
        headline: 'A vibrant East-meets-West layover.',
        highlights: ['Blue Mosque', 'Bosphorus cruise'],
        hotel: hotel({ hotel_id: 'hotel-ist-1' }),
        alternatives: [hotel({ hotel_id: 'hotel-ist-2', name: 'Istanbul Old City Inn', total_minor: 7_000 })],
        transfer_in: transfer({ transfer_id: 'transfer-ist-in' }),
        transfer_out: transfer({
          transfer_id: 'transfer-ist-out',
          from_label: 'Sultanahmet',
          to_label: 'IST Airport',
          total_minor: 1_800,
        }),
      },
    ],
    ...overrides,
  };
}

/**
 * A valid, realistic `HttpRawSearchResponse` for `sampleCriteria()`: two
 * direct offers and one Istanbul-stopover offer, all comfortably within the
 * $1500 budget, USD, snake_case minor-unit prices throughout.
 */
export function validHttpRawResponse(
  overrides: Partial<Omit<HttpRawSearchResponse, 'source'>> = {},
): HttpRawSearchResponse {
  return {
    source: 'http-v1',
    search_id: 'search-http-1',
    generated_at: '2026-09-15T00:00:00.000Z',
    currency: 'USD',
    offers: [directOffer(), stopoverOffer(), directOfferAfternoon()],
    meta: { candidates: 3, over_budget: 0 },
    ...overrides,
  };
}

/**
 * An offer that is valid per the HTTP wire schema (`httpRawSearchResponseSchema`)
 * but fails the domain `journeySchema` — the marketing carrier's comfort
 * rating is outside `airlineSchema`'s 1–5 bound, which the wire schema does
 * not constrain. Used to prove `normaliseHttp` drops a single bad journey
 * while keeping its siblings.
 */
export function offerWithBrokenField(offerId = 'offer-broken'): HttpRawOffer {
  return directOffer({
    offer_id: offerId,
    slices: [
      slice({
        slice_id: `${offerId}-slice`,
        marketing_carrier: { code: 'XX', name: 'Bad Air', comfort_1to5: 12 },
      }),
    ],
  });
}

/** `validHttpRawResponse` with one broken offer mixed in among valid siblings. */
export function partiallyInvalidHttpRawResponse(): HttpRawSearchResponse {
  return validHttpRawResponse({
    offers: [directOffer(), offerWithBrokenField(), stopoverOffer()],
  });
}

/** Every offer fails domain validation — normalisation should surface `PROVIDER_FAILURE`. */
export function allInvalidHttpRawResponse(): HttpRawSearchResponse {
  return validHttpRawResponse({
    offers: [offerWithBrokenField('offer-broken-1'), offerWithBrokenField('offer-broken-2')],
  });
}

/** A non-USD response — every offer must be dropped (v1 is USD-only). */
export function nonUsdHttpRawResponse(): HttpRawSearchResponse {
  return validHttpRawResponse({ currency: 'EUR' });
}

/** Zero offers — the provider found no routes at all. */
export function emptyOffersHttpRawResponse(): HttpRawSearchResponse {
  return validHttpRawResponse({ offers: [] });
}

/**
 * A wire body that fails `httpRawSearchResponseSchema` itself (shape-invalid,
 * not just domain-invalid) — `offers` is not an array. Used to exercise
 * `parseHttpRawBody`'s `ProviderError('PROVIDER_FAILURE')` path.
 */
export function malformedWireBody(): Record<string, unknown> {
  return {
    search_id: 'search-malformed',
    generated_at: '2026-09-15T00:00:00.000Z',
    currency: 'USD',
    offers: 'not-an-array',
    meta: { candidates: 0, over_budget: 0 },
  };
}

// ——— synthetic raw payload ———

/** Wraps the real, pure `generateSearchResult` behind the synthetic adapter's raw shape. */
export function syntheticRawPayload(
  criteria: SearchCriteria = sampleCriteria(),
  generatedAt?: string,
): SyntheticRawPayload {
  return {
    source: 'synthetic-v1',
    result: generateSearchResult(criteria, generatedAt),
  };
}
