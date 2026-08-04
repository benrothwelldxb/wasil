/**
 * Zod schemas validating the generic accommodation model at the provider
 * boundary — a normalised payload that fails this never reaches the app.
 */
import { z } from 'zod';
import { hotelOptionSchema, moneySchema } from '@/domain/schemas';
import type { StopoverAccommodation } from './types';

export const weatherSummarySchema = z.object({
  condition: z.enum(['sunny', 'partly_cloudy', 'cloudy', 'rainy', 'snowy']),
  averageHighC: z.number(),
  averageLowC: z.number(),
  precipitationChance: z.number().min(0).max(1),
});

export const airportTransferSummarySchema = z.object({
  mode: z.enum(['metro', 'train', 'taxi', 'shuttle']),
  durationMinutes: z.number().nonnegative(),
  price: moneySchema,
  comfortRating: z.number().min(1).max(5),
});

export const stopoverAccommodationSchema: z.ZodType<StopoverAccommodation> = z.object({
  cityIata: z.string().regex(/^[A-Z]{3}$/),
  cityName: z.string().min(1),
  countryCode: z.string().length(2),
  nights: z.number().int().min(1).max(3),
  rooms: z.number().int().min(1),
  hotels: z.array(hotelOptionSchema).min(1),
  averageNightlyPrice: moneySchema,
  totalAccommodationCost: moneySchema,
  walkingScore: z.number().min(0).max(100),
  neighbourhoodRating: z.number().min(0).max(5),
  safetyScore: z.number().min(0).max(100),
  weather: weatherSummarySchema,
  airportTransfer: airportTransferSummarySchema,
  providerId: z.string().min(1),
}) as z.ZodType<StopoverAccommodation>;
