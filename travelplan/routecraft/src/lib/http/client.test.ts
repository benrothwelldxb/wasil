import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import { createHttpClient } from './client';
import { HttpError } from './errors';

const BASE_URL = 'https://api.test';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

interface Widget {
  id: string;
  count: number;
}

const widgetSchema = z.object({
  id: z.string(),
  count: z.number(),
});

describe('createHttpClient', () => {
  describe('success', () => {
    it('returns a typed JSON response with no schema', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/1`, () => HttpResponse.json({ id: '1', count: 3 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const result = await client.get<Widget>('/widgets/1');

      expect(result).toEqual({ id: '1', count: 3 });
    });

    it('validates and returns the response through a Zod schema', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/2`, () => HttpResponse.json({ id: '2', count: 7 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const result = await client.get('/widgets/2', { schema: widgetSchema });

      expect(result).toEqual({ id: '2', count: 7 });
    });

    it('returns undefined for an empty 204 response', async () => {
      server.use(http.delete(`${BASE_URL}/widgets/3`, () => new HttpResponse(null, { status: 204 })));
      const client = createHttpClient({ baseUrl: BASE_URL });

      const result = await client.delete('/widgets/3');

      expect(result).toBeUndefined();
    });

    it('sends a JSON body with content-type for POST', async () => {
      let receivedBody: unknown;
      let receivedContentType: string | null = null;
      server.use(
        http.post(`${BASE_URL}/widgets`, async ({ request }) => {
          receivedContentType = request.headers.get('content-type');
          receivedBody = await request.json();
          return HttpResponse.json({ id: 'new', count: 0 }, { status: 201 });
        }),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const result = await client.post<Widget>('/widgets', { name: 'gadget' });

      expect(receivedContentType).toContain('application/json');
      expect(receivedBody).toEqual({ name: 'gadget' });
      expect(result).toEqual({ id: 'new', count: 0 });
    });
  });

  describe('schema validation failure', () => {
    it('throws HttpError kind "parse" when the response fails the schema', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/bad`, () => HttpResponse.json({ id: '1', count: 'not-a-number' })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/bad', { schema: widgetSchema }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('parse');
      expect((err as HttpError).status).toBe(200);
    });

    it('throws HttpError kind "parse" when the response body is not valid JSON', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/malformed`, () =>
          new HttpResponse('{not json', { headers: { 'content-type': 'application/json' } }),
        ),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/malformed').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('parse');
    });
  });

  describe('non-2xx normalisation', () => {
    it('normalises a 404 with a JSON body to HttpError kind "http"', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/missing`, () =>
          HttpResponse.json({ code: 'NOT_FOUND', message: 'no such widget' }, { status: 404 }),
        ),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/missing').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      const httpErr = err as HttpError;
      expect(httpErr.kind).toBe('http');
      expect(httpErr.status).toBe(404);
      expect(httpErr.body).toEqual({ code: 'NOT_FOUND', message: 'no such widget' });
      expect(httpErr.url).toBe(`${BASE_URL}/widgets/missing`);
    });

    it('normalises a 400 with a plain-text body to HttpError kind "http"', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/bad-request`, () => new HttpResponse('bad input', { status: 400 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/bad-request').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      const httpErr = err as HttpError;
      expect(httpErr.kind).toBe('http');
      expect(httpErr.status).toBe(400);
      expect(httpErr.body).toBe('bad input');
    });

    it('normalises a 500 with a JSON body to HttpError kind "http"', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/boom`, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/boom').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      const httpErr = err as HttpError;
      expect(httpErr.kind).toBe('http');
      expect(httpErr.status).toBe(500);
      expect(httpErr.body).toEqual({ error: 'boom' });
    });

    it('normalises a 503 with a plain-text body to HttpError kind "http"', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/unavailable`, () => new HttpResponse('down for maintenance', { status: 503 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/unavailable').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      const httpErr = err as HttpError;
      expect(httpErr.kind).toBe('http');
      expect(httpErr.status).toBe(503);
      expect(httpErr.body).toBe('down for maintenance');
    });
  });

  describe('timeout', () => {
    it('throws HttpError kind "timeout" when the response is slower than timeoutMs', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/slow`, async () => {
          await delay(200);
          return HttpResponse.json({ id: 'slow', count: 1 });
        }),
      );
      const client = createHttpClient({ baseUrl: BASE_URL, timeoutMs: 20 });

      const err = await client.get('/widgets/slow').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('timeout');
      expect((err as HttpError).status).toBeUndefined();
    });
  });

  describe('caller abort', () => {
    it('throws HttpError kind "abort" for a pre-aborted signal', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/abort-me`, () => HttpResponse.json({ id: 'x', count: 0 })),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });
      const controller = new AbortController();
      controller.abort();

      const err = await client
        .get('/widgets/abort-me', { signal: controller.signal })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('abort');
    });

    it('throws HttpError kind "abort" (not "timeout") when the caller aborts mid-flight', async () => {
      server.use(
        http.get(`${BASE_URL}/widgets/abort-mid-flight`, async () => {
          await delay(50);
          return HttpResponse.json({ id: 'x', count: 0 });
        }),
      );
      const client = createHttpClient({ baseUrl: BASE_URL, timeoutMs: 10_000 });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);

      const err = await client
        .get('/widgets/abort-mid-flight', { signal: controller.signal })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('abort');
    });
  });

  describe('network error', () => {
    it('throws HttpError kind "network" when the connection fails', async () => {
      server.use(http.get(`${BASE_URL}/widgets/unreachable`, () => HttpResponse.error()));
      const client = createHttpClient({ baseUrl: BASE_URL });

      const err = await client.get('/widgets/unreachable').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).kind).toBe('network');
      expect((err as HttpError).cause).toBeDefined();
    });
  });

  describe('onError hook', () => {
    it('calls onError with the HttpError before throwing', async () => {
      server.use(http.get(`${BASE_URL}/widgets/onerror`, () => new HttpResponse('nope', { status: 400 })));
      const seen: HttpError[] = [];
      const client = createHttpClient({ baseUrl: BASE_URL, onError: (e) => seen.push(e) });

      await expect(client.get('/widgets/onerror')).rejects.toBeInstanceOf(HttpError);

      expect(seen).toHaveLength(1);
      expect(seen[0]?.kind).toBe('http');
    });
  });

  describe('query serialisation', () => {
    it('appends query params, coercing numbers/booleans and skipping undefined', async () => {
      let capturedSearch = '';
      server.use(
        http.get(`${BASE_URL}/search`, ({ request }) => {
          capturedSearch = new URL(request.url).search;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      await client.get('/search', {
        query: { q: 'flights', page: 2, active: true, cursor: undefined },
      });

      const params = new URLSearchParams(capturedSearch);
      expect(params.get('q')).toBe('flights');
      expect(params.get('page')).toBe('2');
      expect(params.get('active')).toBe('true');
      expect(params.has('cursor')).toBe(false);
    });
  });

  describe('base-URL join', () => {
    const cases: Array<[string, string, string]> = [
      ['https://api.test', '/journeys', 'https://api.test/journeys'],
      ['https://api.test/', '/journeys', 'https://api.test/journeys'],
      ['https://api.test', 'journeys', 'https://api.test/journeys'],
      ['https://api.test/', 'journeys', 'https://api.test/journeys'],
      ['https://api.test/v1', '/journeys', 'https://api.test/v1/journeys'],
      ['https://api.test/v1/', '/journeys', 'https://api.test/v1/journeys'],
    ];

    it.each(cases)('joins base %s and path %s into %s', async (baseUrl, path, expectedUrl) => {
      let capturedUrl = '';
      server.use(
        http.get(expectedUrl, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = createHttpClient({ baseUrl });

      await client.get(path);

      expect(capturedUrl).toBe(expectedUrl);
    });

    it('uses an absolute path as-is, ignoring baseUrl', async () => {
      let capturedUrl = '';
      server.use(
        http.get('https://other.test/direct', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = createHttpClient({ baseUrl: BASE_URL });

      await client.get('https://other.test/direct');

      expect(capturedUrl).toBe('https://other.test/direct');
    });
  });
});
