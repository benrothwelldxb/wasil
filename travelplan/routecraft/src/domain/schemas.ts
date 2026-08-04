/**
 * Zod schemas — validate at boundaries only (form input, URL params, provider
 * output, persisted state). Internal calls trust the TypeScript types.
 */
import { z } from 'zod';
import type {
  CabinClass,
  Journey,
  SearchCriteria,
  SearchResult,
  TravelPreference,
} from './types';

const IATA_RE = /^[A-Z]{3}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CABIN_CLASSES = [
  'economy',
  'premium_economy',
  'business',
] as const satisfies readonly CabinClass[];

export const TRAVEL_PREFERENCES = [
  'culture',
  'food',
  'nightlife',
  'nature',
  'shopping',
  'relaxation',
  'family',
  'speed',
  'comfort',
] as const satisfies readonly TravelPreference[];

export const moneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.literal('USD'),
});

export const airportRefSchema = z.object({
  iata: z.string().regex(IATA_RE),
  cityName: z.string().min(1),
  countryCode: z.string().length(2),
});

export const airlineSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  comfortRating: z.number().min(1).max(5),
});

export const legSchema = z.object({
  id: z.string().min(1),
  from: airportRefSchema,
  to: airportRefSchema,
  departure: z.string().min(1),
  arrival: z.string().min(1),
  durationMinutes: z.number().positive(),
  airline: airlineSchema,
  flightNumber: z.string().min(2),
  cabin: z.enum(CABIN_CLASSES),
  aircraft: z.string().min(1),
  isRedEye: z.boolean(),
  pricePerPax: moneySchema,
});

export const hotelOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(['budget', 'midscale', 'upscale']),
  starRating: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  guestRating: z.number().min(0).max(10),
  neighborhood: z.string().min(1),
  pricePerNight: moneySchema,
  totalPrice: moneySchema,
  amenities: z.array(z.string()),
});

export const transferSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['metro', 'train', 'taxi', 'shuttle']),
  from: z.string().min(1),
  to: z.string().min(1),
  durationMinutes: z.number().nonnegative(),
  price: moneySchema,
  comfortRating: z.number().min(1).max(5),
});

export const stopoverCitySchema = z.object({
  airport: airportRefSchema,
  cityName: z.string().min(1),
  countryCode: z.string().length(2),
  nights: z.number().int().min(1).max(3),
  appealScore: z.number().min(0).max(100),
  tags: z.array(z.enum(TRAVEL_PREFERENCES)),
  headline: z.string().min(1),
  highlights: z.array(z.string()),
  visaNote: z.string().optional(),
  hotel: hotelOptionSchema,
  alternativeHotels: z.array(hotelOptionSchema),
  transfers: z.object({
    arrival: transferSchema,
    departure: transferSchema,
  }),
});

export const costBreakdownSchema = z.object({
  flights: moneySchema,
  hotels: moneySchema,
  transfers: moneySchema,
  total: moneySchema,
  perPerson: moneySchema,
  budget: moneySchema,
  headroom: moneySchema,
  headroomPct: z.number().min(0).max(1),
});

export const experienceScoreSchema = z.object({
  total: z.number().min(0).max(100),
  factors: z.object({
    stopoverAppeal: z.number().min(0).max(100),
    comfort: z.number().min(0).max(100),
    travelTimeEfficiency: z.number().min(0).max(100),
    layoverQuality: z.number().min(0).max(100),
    valueForMoney: z.number().min(0).max(100),
    scheduleConvenience: z.number().min(0).max(100),
  }),
  weights: z
    .object({
      stopoverAppeal: z.number(),
      comfort: z.number(),
      travelTimeEfficiency: z.number(),
      layoverQuality: z.number(),
      valueForMoney: z.number(),
      scheduleConvenience: z.number(),
    })
    .refine(
      (w) =>
        Math.abs(
          w.stopoverAppeal +
            w.comfort +
            w.travelTimeEfficiency +
            w.layoverQuality +
            w.valueForMoney +
            w.scheduleConvenience -
            1,
        ) < 1e-6,
      { message: 'Effective weights must sum to 1' },
    ),
  narrative: z.string(),
});

export const paxSchema = z.object({
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(6),
});

export const searchCriteriaSchema = z
  .object({
    origin: z.string().regex(IATA_RE),
    destination: z.string().regex(IATA_RE),
    departureDate: z.string().regex(ISO_DATE_RE),
    returnDate: z.string().regex(ISO_DATE_RE).optional(),
    pax: paxSchema,
    budget: moneySchema.refine((m) => m.amount >= 100 && m.amount <= 50_000, {
      message: 'Budget must be between $100 and $50,000',
    }),
    cabin: z.enum(CABIN_CLASSES),
    preferences: z.array(z.enum(TRAVEL_PREFERENCES)).max(3),
    maxStopovers: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    minStopoverNights: z.literal(1),
    maxStopoverNights: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .refine((c) => c.origin !== c.destination, {
    message: 'Origin and destination must differ',
    path: ['destination'],
  })
  .refine((c) => !c.returnDate || c.returnDate > c.departureDate, {
    message: 'Return date must be after departure',
    path: ['returnDate'],
  });

export const journeySchema: z.ZodType<Journey> = z.object({
  id: z.string().min(1),
  kind: z.enum(['direct', 'stopover']),
  criteria: searchCriteriaSchema,
  legs: z.array(legSchema).min(1),
  stopovers: z.array(stopoverCitySchema),
  totalTravelTimeMinutes: z.number().positive(),
  doorToDoorMinutes: z.number().positive(),
  cost: costBreakdownSchema,
  score: experienceScoreSchema,
  badges: z.array(
    z.enum(['best-experience', 'fastest', 'best-value', 'hidden-gem']),
  ),
}) as z.ZodType<Journey>;

export const searchResultSchema: z.ZodType<SearchResult> = z.object({
  criteria: searchCriteriaSchema,
  journeys: z.array(journeySchema),
  generatedAt: z.string().min(1),
  providerId: z.string().min(1),
  stats: z.object({
    candidatesConsidered: z.number().int().nonnegative(),
    overBudgetFiltered: z.number().int().nonnegative(),
    cheapestOverBudget: moneySchema.optional(),
  }),
}) as z.ZodType<SearchResult>;

/**
 * URL search params → SearchCriteria. All inbound values are strings, so we
 * coerce and fall back to sensible defaults for optional fields.
 */
export const searchParamsSchema = z
  .object({
    origin: z.string().toUpperCase().pipe(z.string().regex(IATA_RE)),
    destination: z.string().toUpperCase().pipe(z.string().regex(IATA_RE)),
    departureDate: z.string().regex(ISO_DATE_RE),
    returnDate: z.string().regex(ISO_DATE_RE).optional().catch(undefined),
    adults: z.coerce.number().int().min(1).max(9).catch(1),
    children: z.coerce.number().int().min(0).max(6).catch(0),
    budget: z.coerce.number().min(100).max(50_000),
    cabin: z.enum(CABIN_CLASSES).catch('economy'),
    preferences: z
      .string()
      .optional()
      .transform((s) =>
        s
          ? s
              .split(',')
              .map((p) => p.trim())
              .filter((p): p is TravelPreference =>
                (TRAVEL_PREFERENCES as readonly string[]).includes(p),
              )
              .slice(0, 3)
          : [],
      ),
    maxStopovers: z.coerce.number().int().min(0).max(2).catch(2),
    maxStopoverNights: z.coerce.number().int().min(1).max(3).catch(2),
  })
  .transform((p): SearchCriteria => {
    const maxStopovers = p.maxStopovers as 0 | 1 | 2;
    const maxStopoverNights = p.maxStopoverNights as 1 | 2 | 3;
    return {
      origin: p.origin,
      destination: p.destination,
      departureDate: p.departureDate,
      ...(p.returnDate ? { returnDate: p.returnDate } : {}),
      pax: { adults: p.adults, children: p.children },
      budget: { amount: p.budget, currency: 'USD' },
      cabin: p.cabin,
      preferences: p.preferences,
      maxStopovers,
      minStopoverNights: 1,
      maxStopoverNights,
    };
  });

export const persistedUiStateSchema = z.object({
  theme: z.enum(['light', 'dark']).catch('dark'),
  lastSearch: z.unknown().optional(),
});
