import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { searchResultSchema } from '@/domain/schemas';
import { ProviderError, isProviderError } from '@/data/provider/errors';
import { createHttpClient, HttpError, isHttpError } from '@/lib/http';
import { server } from '@/test/msw/server';
import { journeySearchHandler } from '@/test/msw/handlers';
import { malformedWireBody, sampleCriteria, validHttpRawResponse } from '@/test/fixtures/raw-payloads';

vi.mock('@/config/flags', () => ({
  isEnabled: vi.fn(),
}));

import { isEnabled } from '@/config/flags';
import { selectAdapters } from './adapter-registry';
import { HttpFlightAdapter } from './HttpFlightAdapter';
import { SyntheticFlightAdapter } from './SyntheticFlightAdapter';

const isEnabledMock = vi.mocked(isEnabled);
const criteria = sampleCriteria();

// `getDefaultHttpClient()` resolves relative URLs (env.apiBaseUrl defaults to
// '/api'), which the fetch implementation under jsdom cannot parse without a
// document base URL. Tests bind an explicit absolute-URL client instead; the
// msw wildcard pattern in `journeySearchHandler` matches any origin regardless.
const TEST_BASE_URL = 'https://api.test';
function testHttpAdapter(): HttpFlightAdapter {
  return new HttpFlightAdapter({ http: createHttpClient({ baseUrl: TEST_BASE_URL }) });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  isEnabledMock.mockReset();
  // Default: no artificial latency, so tests never depend on real timers.
  isEnabledMock.mockReturnValue(false);
});

describe('selectAdapters', () => {
  it('returns only the synthetic adapter when both flags are disabled', () => {
    const adapters = selectAdapters({ httpProvider: false, stopoverDiscovery: false });
    expect(adapters.map((a) => a.id)).toEqual(['synthetic-v1']);
  });

  it('returns stopover first, synthetic second when stopoverDiscovery is enabled', () => {
    const adapters = selectAdapters({ httpProvider: false, stopoverDiscovery: true });
    expect(adapters.map((a) => a.id)).toEqual(['stopover-v1', 'synthetic-v1']);
  });

  it('returns HTTP first, synthetic second (silent fallback) when httpProvider is enabled', () => {
    const adapters = selectAdapters({ httpProvider: true, stopoverDiscovery: false });
    expect(adapters.map((a) => a.id)).toEqual(['http-v1', 'synthetic-v1']);
  });

  it('returns stopover, http, synthetic in order when both flags are enabled', () => {
    const adapters = selectAdapters({ httpProvider: true, stopoverDiscovery: true });
    expect(adapters.map((a) => a.id)).toEqual(['stopover-v1', 'http-v1', 'synthetic-v1']);
  });
});

describe('SyntheticFlightAdapter', () => {
  it('search() returns {source: "synthetic-v1", result} with a valid SearchResult', async () => {
    const adapter = new SyntheticFlightAdapter();

    const raw = await adapter.search(criteria);

    expect(raw.source).toBe('synthetic-v1');
    expect(() => searchResultSchema.parse(raw.result)).not.toThrow();
    expect(raw.result.journeys.length).toBeGreaterThan(0);
  });

  it('rejects immediately with the unchanged abort reason when aborted before/at the start of the latency wait', async () => {
    isEnabledMock.mockReturnValue(true); // force the latency path
    const adapter = new SyntheticFlightAdapter();
    const controller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    controller.abort(reason);

    await expect(adapter.search(criteria, { signal: controller.signal })).rejects.toBe(reason);
  });

  describe('latency path (fake timers — no real waiting)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves normally once the seeded latency elapses', async () => {
      isEnabledMock.mockReturnValue(true);
      const adapter = new SyntheticFlightAdapter();

      const promise = adapter.search(criteria);
      await vi.advanceTimersByTimeAsync(600); // covers the full 120–520ms seeded range

      const raw = await promise;
      expect(raw.source).toBe('synthetic-v1');
    });

    it('rejects with the unchanged abort reason when aborted mid-wait', async () => {
      isEnabledMock.mockReturnValue(true);
      const adapter = new SyntheticFlightAdapter();
      const controller = new AbortController();
      const reason = new DOMException('cancelled', 'AbortError');

      const promise = adapter.search(criteria, { signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(reason);

      await expect(promise).rejects.toBe(reason);
    });
  });
});

describe('HttpFlightAdapter', () => {
  it('search() returns {source: "http-v1", ...} with the parsed wire fields', async () => {
    const raw = validHttpRawResponse();
    server.use(journeySearchHandler(raw));
    const adapter = testHttpAdapter();

    const result = await adapter.search(criteria);

    expect(result.source).toBe('http-v1');
    expect(result.search_id).toBe(raw.search_id);
    expect(result.currency).toBe(raw.currency);
    expect(result.offers).toHaveLength(raw.offers.length);
    expect(result.offers[0].offer_id).toBe(raw.offers[0].offer_id);
  });

  it('rejects with ProviderError("PROVIDER_FAILURE") for a malformed wire body', async () => {
    server.use(http.get('*/journeys/search', () => HttpResponse.json(malformedWireBody())));
    const adapter = testHttpAdapter();

    const err = await adapter.search(criteria).catch((e: unknown) => e);

    expect(isProviderError(err)).toBe(true);
    expect((err as ProviderError).code).toBe('PROVIDER_FAILURE');
  });

  it('propagates an HTTP 500 as HttpError (kind "http", status 500), not a ProviderError', async () => {
    server.use(
      http.get('*/journeys/search', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    );
    const adapter = testHttpAdapter();

    const err = await adapter.search(criteria).catch((e: unknown) => e);

    expect(isHttpError(err)).toBe(true);
    expect((err as HttpError).kind).toBe('http');
    expect((err as HttpError).status).toBe(500);
  });
});
