import { http, HttpResponse, type RequestHandler } from 'msw';
import type { HttpRawSearchResponse } from '@/data/normalise';
import { validHttpRawResponse } from '@/test/fixtures/raw-payloads';

/**
 * Builds an msw handler for `GET (any origin)/journeys/search` — the endpoint
 * `HttpFlightAdapter` calls. The wildcard origin matches regardless of
 * `env.apiBaseUrl` (absolute or root-relative). Responds with `response`
 * (defaulting to `validHttpRawResponse()`) MINUS its `source` field: the wire
 * body never carries a `source` discriminant — `HttpFlightAdapter` stamps
 * that on after parsing (see `parseHttpRawBody`).
 */
export function journeySearchHandler(response: HttpRawSearchResponse = validHttpRawResponse()): RequestHandler {
  const { source: _source, ...body } = response;
  return http.get('*/journeys/search', () => HttpResponse.json(body));
}

/**
 * Default request handlers for the shared msw server. Empty by default —
 * integration tests register handlers per test with `server.use(...)`.
 */
export const handlers: RequestHandler[] = [];
