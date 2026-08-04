/**
 * The normalisation dispatch point. Every provider's raw payload — however
 * it is shaped on the wire — funnels through here to become a
 * domain-trusted (but not yet ranked or budget-filtered) `SearchResult`.
 * Callers rank via `rankJourneys` and do the final `searchResultSchema`
 * parse; this module's job stops at "well-formed, individually-validated
 * journeys."
 */
import type { SearchCriteria, SearchResult } from '@/domain/types';
import type { Logger } from '@/lib/logger';
import { ProviderError } from '@/data/provider/errors';
import type { RawPayload } from './raw-types';
import { normaliseSynthetic } from './synthetic';
import { normaliseHttp } from './http';

export interface NormaliseContext {
  criteria: SearchCriteria;
  logger: Logger;
}

export function normalise(raw: RawPayload, ctx: NormaliseContext): SearchResult {
  switch (raw.source) {
    case 'synthetic-v1':
      return normaliseSynthetic(raw, ctx);
    case 'http-v1':
      return normaliseHttp(raw, ctx);
    default: {
      // Exhaustiveness guard — `raw` is `never` here if RawPayload's
      // discriminants are all handled above.
      const unknownSource: string = (raw as { source: string }).source;
      throw new ProviderError(
        'PROVIDER_FAILURE',
        `Unknown raw payload source: ${unknownSource}`,
      );
    }
  }
}
