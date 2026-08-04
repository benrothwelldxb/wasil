import { describe, expect, it } from 'vitest';
import type { Journey } from '@/domain/types';
import { journeySchema, searchResultSchema } from '@/domain/schemas';
import { computeCostBreakdown } from '@/domain/scoring';
import { isProviderError } from '@/data/provider/errors';
import {
  normalise,
  normaliseHttp,
  normaliseSynthetic,
  type NormaliseContext,
  type RawPayload,
} from '@/data/normalise';
import {
  allInvalidHttpRawResponse,
  createFakeLogger,
  emptyOffersHttpRawResponse,
  nonUsdHttpRawResponse,
  offerWithBrokenField,
  partiallyInvalidHttpRawResponse,
  sampleCriteria,
  syntheticRawPayload,
  validHttpRawResponse,
} from '@/test/fixtures/raw-payloads';

const criteria = sampleCriteria();

function ctx(): NormaliseContext & { logger: ReturnType<typeof createFakeLogger> } {
  return { criteria, logger: createFakeLogger() };
}

describe('normaliseHttp', () => {
  it('maps a valid HTTP response to schema-valid journeys', () => {
    const raw = validHttpRawResponse();
    const context = ctx();

    const result = normaliseHttp(raw, context);

    expect(result.journeys).toHaveLength(3);
    expect(() => searchResultSchema.parse(result)).not.toThrow();
    for (const j of result.journeys) {
      expect(() => journeySchema.parse(j)).not.toThrow();
    }
    expect(result.providerId).toBe('http-v1');
    expect(result.generatedAt).toBe(raw.generated_at);
    expect(result.stats).toEqual({ candidatesConsidered: 3, overBudgetFiltered: 0 });
  });

  it('converts minor-unit prices to major-unit money (÷100)', () => {
    const raw = validHttpRawResponse();
    const result = normaliseHttp(raw, ctx());

    const direct = result.journeys.find((j) => j.id === 'http-offer-direct-1')!;
    expect(direct.legs[0].pricePerPax).toEqual({ amount: 420, currency: 'USD' });

    const stopover = result.journeys.find((j) => j.id === 'http-offer-stop-ist')!;
    expect(stopover.stopovers[0].hotel.totalPrice).toEqual({ amount: 90, currency: 'USD' });
    expect(stopover.stopovers[0].transfers.arrival.price).toEqual({ amount: 15, currency: 'USD' });
    expect(stopover.stopovers[0].transfers.departure.price).toEqual({ amount: 18, currency: 'USD' });
  });

  it('maps cabin, hotel tier, and transfer mode enums onto domain values', () => {
    const raw = validHttpRawResponse();
    const result = normaliseHttp(raw, ctx());

    const direct = result.journeys.find((j) => j.id === 'http-offer-direct-1')!;
    expect(direct.legs[0].cabin).toBe('economy');

    const stopover = result.journeys.find((j) => j.id === 'http-offer-stop-ist')!;
    expect(stopover.stopovers[0].hotel.tier).toBe('midscale');
    expect(stopover.stopovers[0].transfers.arrival.mode).toBe('metro');
    expect(stopover.stopovers[0].transfers.departure.mode).toBe('metro');
  });

  it('filters out tags that are not known TravelPreferences', () => {
    const raw = validHttpRawResponse();
    const result = normaliseHttp(raw, ctx());

    const stopover = result.journeys.find((j) => j.id === 'http-offer-stop-ist')!;
    // Wire tags were ['culture', 'nightlife', 'mystery-tag'].
    expect(stopover.stopovers[0].tags).toEqual(['culture', 'nightlife']);
  });

  it('populates stopover fields from the nested airport object', () => {
    const raw = validHttpRawResponse();
    const result = normaliseHttp(raw, ctx());

    const stopover = result.journeys.find((j) => j.id === 'http-offer-stop-ist')!;
    expect(stopover.stopovers[0].airport).toEqual({
      iata: 'IST',
      cityName: 'Istanbul',
      countryCode: 'TR',
    });
    expect(stopover.stopovers[0].cityName).toBe('Istanbul');
    expect(stopover.stopovers[0].countryCode).toBe('TR');
  });

  it('recomputes cost via computeCostBreakdown rather than trusting any wire total', () => {
    const raw = validHttpRawResponse();
    const result = normaliseHttp(raw, ctx());

    const stopover = result.journeys.find((j) => j.id === 'http-offer-stop-ist')!;
    // Hand-computed from the mapped domain values: legs 220+240, hotel 90, transfers 15+18.
    expect(stopover.cost.flights.amount).toBeCloseTo(460);
    expect(stopover.cost.hotels.amount).toBeCloseTo(90);
    expect(stopover.cost.transfers.amount).toBeCloseTo(33);
    expect(stopover.cost.total.amount).toBeCloseTo(583);

    // And it matches independently recomputing from the journey's own mapped legs/stopovers.
    const recomputed = computeCostBreakdown({
      legs: stopover.legs,
      stopovers: stopover.stopovers,
      pax: criteria.pax,
      budget: criteria.budget,
    });
    expect(stopover.cost).toEqual(recomputed);
  });

  it('drops a single invalid journey, keeps its siblings, and logs a warning', () => {
    const raw = partiallyInvalidHttpRawResponse();
    const context = ctx();

    const result = normaliseHttp(raw, context);

    expect(result.journeys).toHaveLength(2);
    expect(result.journeys.map((j) => j.id).sort()).toEqual(
      ['http-offer-direct-1', 'http-offer-stop-ist'].sort(),
    );
    expect(context.logger.calls.warn).toHaveLength(1);
    expect(context.logger.calls.warn[0].msg).toBe('dropped invalid journey');
    expect(context.logger.calls.warn[0].ctx).toMatchObject({
      source: 'http-v1',
      id: 'http-offer-broken',
    });
  });

  it('drops all offers and throws PROVIDER_FAILURE for a non-USD currency, logging once', () => {
    const raw = nonUsdHttpRawResponse();
    const context = ctx();

    let thrown: unknown;
    try {
      normaliseHttp(raw, context);
      throw new Error('expected throw');
    } catch (err) {
      thrown = err;
    }

    expect(isProviderError(thrown)).toBe(true);
    expect((thrown as { code: string }).code).toBe('PROVIDER_FAILURE');
    expect(context.logger.calls.warn).toHaveLength(1);
    expect(context.logger.calls.warn[0].msg).toBe('dropped all offers: unsupported currency');
    expect(context.logger.calls.warn[0].ctx).toMatchObject({ currency: 'EUR' });
  });

  it('throws NO_ROUTES for a response with zero offers', () => {
    const raw = emptyOffersHttpRawResponse();

    try {
      normaliseHttp(raw, ctx());
      throw new Error('expected throw');
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('NO_ROUTES');
    }
  });

  it('throws PROVIDER_FAILURE when offers are present but all fail validation', () => {
    const raw = allInvalidHttpRawResponse();

    try {
      normaliseHttp(raw, ctx());
      throw new Error('expected throw');
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('PROVIDER_FAILURE');
    }
  });
});

describe('normaliseSynthetic', () => {
  it('passes already-valid journeys through unchanged', () => {
    const raw = syntheticRawPayload(criteria);
    const context = ctx();

    const result = normaliseSynthetic(raw, context);

    expect(result.journeys.map((j) => j.id)).toEqual(raw.result.journeys.map((j) => j.id));
    expect(context.logger.calls.warn).toHaveLength(0);
    for (const j of result.journeys) {
      expect(() => journeySchema.parse(j)).not.toThrow();
    }
  });

  it('drops an invalid journey while keeping valid ones, and logs a warning', () => {
    const raw = syntheticRawPayload(criteria);
    const validJourney = raw.result.journeys[0];
    // TypeScript-valid but runtime-invalid: score.total is out of the 0–100 bound.
    const brokenJourney: Journey = {
      ...validJourney,
      id: `${validJourney.id}-broken`,
      score: { ...validJourney.score, total: 999 },
    };
    const mixed = { ...raw, result: { ...raw.result, journeys: [validJourney, brokenJourney] } };
    const context = ctx();

    const result = normaliseSynthetic(mixed, context);

    expect(result.journeys).toHaveLength(1);
    expect(result.journeys[0].id).toBe(validJourney.id);
    expect(context.logger.calls.warn).toHaveLength(1);
    expect(context.logger.calls.warn[0].msg).toBe('dropped invalid journey');
    expect(context.logger.calls.warn[0].ctx).toMatchObject({
      source: 'synthetic-v1',
      id: brokenJourney.id,
    });
  });
});

describe('normalise dispatch', () => {
  it('dispatches synthetic-v1 payloads to normaliseSynthetic', () => {
    const raw = syntheticRawPayload(criteria);
    expect(normalise(raw, ctx())).toEqual(normaliseSynthetic(raw, ctx()));
  });

  it('dispatches http-v1 payloads to normaliseHttp', () => {
    const raw = validHttpRawResponse();
    expect(normalise(raw, ctx())).toEqual(normaliseHttp(raw, ctx()));
  });

  it('throws PROVIDER_FAILURE for an unrecognised source', () => {
    const bogus = { source: 'bogus-v9' } as unknown as RawPayload;

    try {
      normalise(bogus, ctx());
      throw new Error('expected throw');
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe('PROVIDER_FAILURE');
      expect((err as Error).message).toContain('bogus-v9');
    }
  });
});

// Exercise the standalone `offerWithBrokenField` fixture directly, proving it
// really is wire-valid-but-domain-invalid (guards the fixture itself against
// silent drift as the schemas evolve).
describe('offerWithBrokenField fixture', () => {
  it('produces an offer whose comfort rating is out of the domain-valid 1–5 range', () => {
    const offer = offerWithBrokenField();
    expect(offer.slices[0].marketing_carrier.comfort_1to5).toBeGreaterThan(5);
  });
});
