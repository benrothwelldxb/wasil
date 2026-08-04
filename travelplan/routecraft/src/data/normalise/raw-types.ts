/**
 * Raw provider payload shapes and their wire-boundary validation.
 *
 * `SyntheticRawPayload` wraps an already-domain-shaped `SearchResult` (still
 * UNTRUSTED — the synthetic engine's output is validated the same as any
 * other provider's before it reaches the UI). `HttpRawSearchResponse` is the
 * wire shape for a hypothetical HTTP flight-search provider: snake_case,
 * minor-unit money, no `source` discriminant on the wire (the HTTP adapter
 * stamps that on after parsing).
 */
import { z } from 'zod';
import type { SearchResult } from '@/domain/types';
import { ProviderError } from '@/data/provider/errors';

// ——— synthetic ———

export interface SyntheticRawPayload {
  readonly source: 'synthetic-v1';
  readonly result: SearchResult; // UNTRUSTED — validated per-journey during normalisation
}

// ——— http wire shape ———

export interface HttpRawAirport {
  code: string;
  city: string;
  country: string;
}

export interface HttpRawSlice {
  slice_id: string;
  origin: HttpRawAirport;
  dest: HttpRawAirport;
  depart_at: string;
  arrive_at: string;
  duration_min: number;
  marketing_carrier: { code: string; name: string; comfort_1to5: number };
  flight_no: string;
  cabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS';
  equipment: string;
  price_minor_per_pax: number;
  red_eye: boolean;
}

export interface HttpRawHotel {
  hotel_id: string;
  name: string;
  tier: 'BUDGET' | 'MIDSCALE' | 'UPSCALE';
  stars: 3 | 4 | 5;
  guest_score_0to10: number;
  area: string;
  nightly_minor: number;
  total_minor: number;
  amenities: string[];
}

export interface HttpRawTransfer {
  transfer_id: string;
  mode: 'METRO' | 'TRAIN' | 'TAXI' | 'SHUTTLE';
  from_label: string;
  to_label: string;
  duration_min: number;
  total_minor: number;
  comfort_1to5: number;
}

export interface HttpRawStay {
  airport: HttpRawAirport;
  nights: number;
  appeal_0to100: number;
  tags: string[];
  headline: string;
  highlights: string[];
  visa_note?: string;
  hotel: HttpRawHotel;
  alternatives: HttpRawHotel[];
  transfer_in: HttpRawTransfer;
  transfer_out: HttpRawTransfer;
}

export interface HttpRawOffer {
  offer_id: string;
  slices: HttpRawSlice[];
  stays: HttpRawStay[];
}

export interface HttpRawSearchResponse {
  readonly source: 'http-v1';
  search_id: string;
  generated_at: string;
  currency: string;
  offers: HttpRawOffer[];
  meta: { candidates: number; over_budget: number; cheapest_over_budget_minor?: number };
}

export type RawPayload = SyntheticRawPayload | HttpRawSearchResponse;

// ——— wire-shape validation ———
//
// The wire body never carries `source` — the HTTP adapter stamps
// `source: 'http-v1'` on after a successful parse. These schemas therefore
// validate everything EXCEPT `source`.

const httpRawAirportSchema = z.object({
  code: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
}) satisfies z.ZodType<HttpRawAirport>;

const httpRawSliceSchema = z.object({
  slice_id: z.string().min(1),
  origin: httpRawAirportSchema,
  dest: httpRawAirportSchema,
  depart_at: z.string().min(1),
  arrive_at: z.string().min(1),
  duration_min: z.number(),
  marketing_carrier: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    comfort_1to5: z.number(),
  }),
  flight_no: z.string().min(1),
  cabin: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS']),
  equipment: z.string().min(1),
  price_minor_per_pax: z.number(),
  red_eye: z.boolean(),
}) satisfies z.ZodType<HttpRawSlice>;

const httpRawHotelSchema = z.object({
  hotel_id: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(['BUDGET', 'MIDSCALE', 'UPSCALE']),
  stars: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  guest_score_0to10: z.number(),
  area: z.string().min(1),
  nightly_minor: z.number(),
  total_minor: z.number(),
  amenities: z.array(z.string()),
}) satisfies z.ZodType<HttpRawHotel>;

const httpRawTransferSchema = z.object({
  transfer_id: z.string().min(1),
  mode: z.enum(['METRO', 'TRAIN', 'TAXI', 'SHUTTLE']),
  from_label: z.string().min(1),
  to_label: z.string().min(1),
  duration_min: z.number(),
  total_minor: z.number(),
  comfort_1to5: z.number(),
}) satisfies z.ZodType<HttpRawTransfer>;

const httpRawStaySchema = z.object({
  airport: httpRawAirportSchema,
  nights: z.number(),
  appeal_0to100: z.number(),
  tags: z.array(z.string()),
  headline: z.string().min(1),
  highlights: z.array(z.string()),
  visa_note: z.string().optional(),
  hotel: httpRawHotelSchema,
  alternatives: z.array(httpRawHotelSchema),
  transfer_in: httpRawTransferSchema,
  transfer_out: httpRawTransferSchema,
}) satisfies z.ZodType<HttpRawStay>;

const httpRawOfferSchema = z.object({
  offer_id: z.string().min(1),
  slices: z.array(httpRawSliceSchema),
  stays: z.array(httpRawStaySchema),
}) satisfies z.ZodType<HttpRawOffer>;

/**
 * Validates the wire BODY (no `source` field — the transport layer never
 * sends its own discriminant). `parseHttpRawBody` below adds `source` back
 * once the shape is confirmed.
 */
export const httpRawSearchResponseSchema = z.object({
  search_id: z.string().min(1),
  generated_at: z.string().min(1),
  currency: z.string().min(1),
  offers: z.array(httpRawOfferSchema),
  meta: z.object({
    candidates: z.number(),
    over_budget: z.number(),
    cheapest_over_budget_minor: z.number().optional(),
  }),
}) satisfies z.ZodType<Omit<HttpRawSearchResponse, 'source'>>;

/**
 * Validates an arbitrary wire body against the HTTP provider's response
 * shape. Throws `ProviderError('PROVIDER_FAILURE', …)` — never a raw
 * `ZodError` — so callers only ever need to catch `ProviderError`.
 */
export function parseHttpRawBody(body: unknown): Omit<HttpRawSearchResponse, 'source'> {
  const parsed = httpRawSearchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_FAILURE',
      `Malformed HTTP provider response: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
