import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SearchCriteria, SearchResult } from '@/domain/types';
import { searchResultSchema } from '@/domain/schemas';
import { createTtlCache, searchCacheKey } from '@/data/cache';
import { normalise as defaultNormalise, type RawPayload } from '@/data/normalise';
import type { AdapterId, FlightAdapter } from '@/data/adapters/FlightAdapter';
import { HttpFlightAdapter } from '@/data/adapters/HttpFlightAdapter';
import { SyntheticFlightAdapter } from '@/data/adapters/SyntheticFlightAdapter';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';
import { ProviderError, isProviderError } from '@/data/provider/errors';
import { createHttpClient, HttpError, isHttpError } from '@/lib/http';
import { server } from '@/test/msw/server';
import { journeySearchHandler } from '@/test/msw/handlers';
import { createFakeLogger, sampleCriteria, syntheticRawPayload, validHttpRawResponse } from '@/test/fixtures/raw-payloads';
import { createFlightEngine } from './FlightEngine';

vi.mock('@/config/flags', () => ({
  isEnabled: vi.fn().mockReturnValue(false),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const criteria = sampleCriteria();

// Deterministic, timer-free retry injection shared by every test in this file.
const immediateSleep = (): Promise<void> => Promise.resolve();
const idJitter = (d: number): number => d;

function countingAdapter(
  id: AdapterId,
  resolve: () => RawPayload | Promise<RawPayload>,
): FlightAdapter & { callCount: () => number } {
  let calls = 0;
  return {
    id,
    displayName: id,
    supportsGetJourney: true,
    async search(_criteria: SearchCriteria, _opts?: { signal?: AbortSignal }): Promise<RawPayload> {
      calls += 1;
      return resolve();
    },
    callCount: () => calls,
  };
}

function failingAdapter(id: AdapterId, error: unknown): FlightAdapter & { callCount: () => number } {
  let calls = 0;
  return {
    id,
    displayName: id,
    supportsGetJourney: true,
    async search(_criteria: SearchCriteria, _opts?: { signal?: AbortSignal }): Promise<RawPayload> {
      calls += 1;
      throw error;
    },
    callCount: () => calls,
  };
}

function freshCache() {
  return createTtlCache<SearchResult>({ ttlMs: 300_000, maxEntries: 50 });
}

describe('FlightEngine.searchJourneys', () => {
  it('cache hit: a second search with the same criteria does not call the adapter again', async () => {
    const adapter = countingAdapter('synthetic-v1', () => syntheticRawPayload(criteria));
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [adapter],
      cache,
      normalise: defaultNormalise,
      retry: { sleep: immediateSleep, jitter: idJitter },
    });

    const first = await engine.searchJourneys(criteria);
    const second = await engine.searchJourneys(criteria);

    expect(adapter.callCount()).toBe(1);
    expect(second).toBe(first); // literally the cached object
    expect(() => searchResultSchema.parse(first)).not.toThrow();
  });

  it('falls back to the next adapter after the first exhausts retries on PROVIDER_FAILURE, and logs a warning', async () => {
    const failing = failingAdapter('synthetic-v1', new ProviderError('PROVIDER_FAILURE', 'boom'));
    const succeeding = countingAdapter('http-v1', () => validHttpRawResponse());
    const logger = createFakeLogger();
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [failing, succeeding],
      cache,
      normalise: defaultNormalise,
      logger,
      retry: { attempts: 2, sleep: immediateSleep, jitter: idJitter },
    });

    const result = await engine.searchJourneys(criteria);

    expect(() => searchResultSchema.parse(result)).not.toThrow();
    expect(result.providerId).toBe('http-v1');
    expect(failing.callCount()).toBe(2); // both retry attempts exhausted
    expect(succeeding.callCount()).toBe(1);
    expect(
      logger.calls.warn.some((w) => w.msg === 'adapter failed, falling back to next adapter'),
    ).toBe(true);

    // Only the successful adapter's key is cached; the failed one never wrote an entry.
    expect(cache.get(searchCacheKey('http-v1', criteria))).toBeDefined();
    expect(cache.get(searchCacheKey('synthetic-v1', criteria))).toBeUndefined();
  });

  it('does not fall back on a terminal ProviderError, and rethrows it unchanged', async () => {
    const terminal = new ProviderError('INVALID_CRITERIA', 'bad input');
    const failing = failingAdapter('synthetic-v1', terminal);
    const neverCalled = countingAdapter('http-v1', () => validHttpRawResponse());
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [failing, neverCalled],
      cache,
      normalise: defaultNormalise,
      retry: { attempts: 3, sleep: immediateSleep, jitter: idJitter },
    });

    await expect(engine.searchJourneys(criteria)).rejects.toBe(terminal);

    expect(failing.callCount()).toBe(1); // not retryable, not retried
    expect(neverCalled.callCount()).toBe(0); // no fallback for a terminal error
  });

  it('propagates a caller abort unchanged and caches nothing', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    controller.abort(reason);
    const adapter = countingAdapter('synthetic-v1', () => syntheticRawPayload(criteria));
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [adapter],
      cache,
      normalise: defaultNormalise,
      retry: { sleep: immediateSleep, jitter: idJitter },
    });

    await expect(
      engine.searchJourneys(criteria, { signal: controller.signal }),
    ).rejects.toBe(reason);

    expect(adapter.callCount()).toBe(0);
    expect(cache.size).toBe(0);
    expect(cache.get(searchCacheKey('synthetic-v1', criteria))).toBeUndefined();
  });

  it('never lets an HttpError escape: after chain exhaustion it throws ProviderError("PROVIDER_FAILURE")', async () => {
    const err503 = new HttpError({ kind: 'http', status: 503, message: 'down', url: 'https://api.test/x' });
    const failing = failingAdapter('synthetic-v1', err503);
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [failing],
      cache,
      normalise: defaultNormalise,
      retry: { attempts: 2, sleep: immediateSleep, jitter: idJitter },
    });

    const thrown = await engine.searchJourneys(criteria).catch((e: unknown) => e);

    expect(isProviderError(thrown)).toBe(true);
    expect((thrown as ProviderError).code).toBe('PROVIDER_FAILURE');
    expect(isHttpError(thrown)).toBe(false);
  });

  it('falls through on an arbitrary (non-Http, non-Provider) adapter error, describing it by its message', async () => {
    const plainError = new Error('weird failure');
    const failing = failingAdapter('synthetic-v1', plainError);
    const logger = createFakeLogger();
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [failing],
      cache,
      normalise: defaultNormalise,
      logger,
      retry: { attempts: 1, sleep: immediateSleep, jitter: idJitter },
    });

    const thrown = await engine.searchJourneys(criteria).catch((e: unknown) => e);

    expect(isProviderError(thrown)).toBe(true);
    expect((thrown as ProviderError).message).toContain('weird failure');
    expect(
      logger.calls.warn.some(
        (w) => w.msg === 'adapter failed, falling back to next adapter' && w.ctx?.error === 'weird failure',
      ),
    ).toBe(true);
  });

  it('wraps a schema-invalid normalised SearchResult in ProviderError("PROVIDER_FAILURE")', async () => {
    const adapter = countingAdapter('synthetic-v1', () => syntheticRawPayload(criteria));
    const validResult = generateSearchResult(criteria);
    // A `normalise` that hands back something the domain schema rejects (empty providerId).
    const brokenNormalise = (): SearchResult => ({ ...validResult, providerId: '' });
    const cache = freshCache();
    const engine = createFlightEngine({
      adapters: [adapter],
      cache,
      normalise: brokenNormalise,
      retry: { sleep: immediateSleep, jitter: idJitter },
    });

    const thrown = await engine.searchJourneys(criteria).catch((e: unknown) => e);

    expect(isProviderError(thrown)).toBe(true);
    expect((thrown as ProviderError).code).toBe('PROVIDER_FAILURE');
    expect((thrown as ProviderError).message).toContain('Engine produced an invalid SearchResult');
  });
});

describe('FlightEngine — provider independence (ranking parity across adapters)', () => {
  it('produces schema-valid, descending-ranked, badged results through the same rankJourneys pipeline for both a synthetic-backed and an HTTP-backed engine, with an identical JourneyProvider surface', async () => {
    server.use(journeySearchHandler(validHttpRawResponse()));

    const syntheticEngine = createFlightEngine({
      adapters: [new SyntheticFlightAdapter()],
      cache: freshCache(),
      normalise: defaultNormalise,
      retry: { sleep: immediateSleep, jitter: idJitter },
    });
    const httpEngine = createFlightEngine({
      adapters: [
        // `getDefaultHttpClient()` resolves relative URLs, which the fetch
        // implementation under jsdom cannot parse without a document base URL
        // — bind an explicit absolute-URL client instead.
        new HttpFlightAdapter({ http: createHttpClient({ baseUrl: 'https://api.test' }) }),
      ],
      cache: freshCache(),
      normalise: defaultNormalise,
      retry: { sleep: immediateSleep, jitter: idJitter },
    });

    const [syntheticResult, httpResult] = await Promise.all([
      syntheticEngine.searchJourneys(criteria),
      httpEngine.searchJourneys(criteria),
    ]);

    for (const result of [syntheticResult, httpResult]) {
      expect(() => searchResultSchema.parse(result)).not.toThrow();
      expect(result.journeys.length).toBeGreaterThan(0);

      for (let i = 1; i < result.journeys.length; i++) {
        expect(result.journeys[i - 1].score.total).toBeGreaterThanOrEqual(result.journeys[i].score.total);
      }
      expect(result.journeys[0].badges).toContain('best-experience');
    }

    // Identical JourneyProvider surface, regardless of which adapter backs it.
    expect(syntheticEngine.id).toBe('flight-engine');
    expect(httpEngine.id).toBe('flight-engine');
    expect(syntheticEngine.id).toBe(httpEngine.id);
    expect(typeof syntheticEngine.searchJourneys).toBe('function');
    expect(typeof syntheticEngine.getJourney).toBe('function');
    expect(typeof httpEngine.searchJourneys).toBe('function');
    expect(typeof httpEngine.getJourney).toBe('function');

    const knownId = syntheticResult.journeys[0].id;
    const found = await syntheticEngine.getJourney(knownId, criteria);
    expect(found?.id).toBe(knownId);
    expect(await syntheticEngine.getJourney('totally-bogus-id', criteria)).toBeNull();
  });
});
