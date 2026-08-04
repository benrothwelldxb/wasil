/**
 * Fetches RAW search results from the (hypothetical) HTTP flight-search
 * provider. Parses the wire body via `parseHttpRawBody` (which throws
 * `ProviderError('PROVIDER_FAILURE', …)` on a malformed shape) and stamps the
 * `source` discriminant back on. Any `HttpError` the underlying `HttpClient`
 * throws propagates unchanged — the `FlightEngine` is responsible for
 * classifying and, if appropriate, retrying it.
 */
import type { SearchCriteria } from '@/domain/types';
import type { HttpRawSearchResponse } from '@/data/normalise';
import { parseHttpRawBody } from '@/data/normalise';
import { criteriaToSearchParams } from '@/domain/url';
import { getDefaultHttpClient, type HttpClient } from '@/lib/http';
import type { FlightAdapter } from './FlightAdapter';

export interface HttpFlightAdapterDeps {
  http?: HttpClient;
}

export class HttpFlightAdapter implements FlightAdapter<HttpRawSearchResponse> {
  readonly id = 'http-v1' as const;
  readonly displayName = 'HTTP Flight Provider';
  readonly supportsGetJourney = false;

  private readonly http: HttpClient;

  constructor({ http }: HttpFlightAdapterDeps = {}) {
    this.http = http ?? getDefaultHttpClient();
  }

  async search(
    criteria: SearchCriteria,
    opts?: { signal?: AbortSignal },
  ): Promise<HttpRawSearchResponse> {
    const body = await this.http.get<unknown>('/journeys/search', {
      query: Object.fromEntries(criteriaToSearchParams(criteria)),
      signal: opts?.signal,
    });
    const parsed = parseHttpRawBody(body);
    return { ...parsed, source: 'http-v1' };
  }
}

/** Module-singleton instance — see `adapter-registry.ts`. */
export const httpFlightAdapter = new HttpFlightAdapter();
