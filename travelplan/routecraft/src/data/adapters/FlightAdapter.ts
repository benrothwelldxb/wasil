/**
 * The adapter seam: a `FlightAdapter` fetches a single provider's RAW payload
 * for a search — nothing more. Normalisation, ranking, retries, caching, and
 * fallback are all the `FlightEngine`'s job (`@/data/engine`), not the
 * adapter's. An adapter's `search()` must reject only with `HttpError` or
 * `ProviderError` — the engine classifies both; no other error shape may
 * escape.
 */
import type { SearchCriteria } from '@/domain/types';
import type { RawPayload } from '@/data/normalise';

export type AdapterId = 'synthetic-v1' | 'http-v1';

export interface FlightAdapter<TRaw extends RawPayload = RawPayload> {
  readonly id: AdapterId;
  /** Internal/logs only — never shown to end users. */
  readonly displayName: string;
  readonly supportsGetJourney: boolean;
  /**
   * Fetches the RAW payload for `criteria`. Rejects with `HttpError` or
   * `ProviderError` only.
   */
  search(criteria: SearchCriteria, opts?: { signal?: AbortSignal }): Promise<TRaw>;
}
