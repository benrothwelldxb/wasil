/**
 * Orchestrates the adapter chain: cache → retryable fetch → normalise →
 * rank → validate → cache, with silent fallback to the next adapter on
 * infrastructure failure. This is the concrete `JourneyProvider` the app
 * uses once the synthetic-only seam is retired — see `provider-registry.ts`.
 */
import type { Journey, SearchCriteria, SearchResult } from '@/domain/types';
import { searchResultSchema } from '@/domain/schemas';
import { rankJourneys } from '@/domain/scoring';
import { normalise as defaultNormalise } from '@/data/normalise';
import type { RawPayload, NormaliseContext } from '@/data/normalise';
import type { ResultCache } from '@/data/cache';
import { createTtlCache, searchCacheKey } from '@/data/cache';
import type { FlightAdapter } from '@/data/adapters/FlightAdapter';
import { selectAdapters } from '@/data/adapters/adapter-registry';
import type { JourneyProvider } from '@/data/provider/JourneyProvider';
import { isProviderError, ProviderError, type ProviderErrorCode } from '@/data/provider/errors';
import { isHttpError } from '@/lib/http';
import { log, type Logger } from '@/lib/logger';
import { isEnabled } from '@/config/flags';
import { withRetry, type RetryOptions } from './retry';

export interface FlightEngineDeps {
  adapters: readonly FlightAdapter[];
  cache: ResultCache<SearchResult>;
  normalise: (raw: RawPayload, ctx: NormaliseContext) => SearchResult;
  retry?: Partial<RetryOptions>;
  logger?: Logger;
}

/** `ProviderError` codes that mean "the answer is the answer" — never fall through. */
const TERMINAL_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  'INVALID_CRITERIA',
  'UNKNOWN_AIRPORT',
  'NO_ROUTES',
]);

function isTerminalProviderError(err: unknown): boolean {
  return isProviderError(err) && TERMINAL_CODES.has(err.code);
}

/** Human-readable summary of an unknown error, for log context and terminal messages. */
function describeError(err: unknown): string {
  if (isHttpError(err)) {
    return `HttpError(kind=${err.kind}${err.status !== undefined ? `, status=${err.status}` : ''}): ${err.message}`;
  }
  if (isProviderError(err)) {
    return `ProviderError(code=${err.code}): ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export class FlightEngine implements JourneyProvider {
  readonly id = 'flight-engine';

  private readonly deps: FlightEngineDeps;
  private readonly logger: Logger;

  constructor(deps: FlightEngineDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? log.child('flight-engine');
  }

  async searchJourneys(
    criteria: SearchCriteria,
    opts?: { signal?: AbortSignal },
  ): Promise<SearchResult> {
    let lastError: unknown;

    for (const adapter of this.deps.adapters) {
      const key = searchCacheKey(adapter.id, criteria);
      const cached = this.deps.cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      try {
        const raw = await withRetry(() => adapter.search(criteria, { signal: opts?.signal }), {
          ...this.deps.retry,
          signal: opts?.signal,
          onRetry: (info) => {
            this.logger.warn('retrying adapter search', {
              adapterId: adapter.id,
              attempt: info.attempt,
              delayMs: info.delayMs,
              error: describeError(info.error),
            });
            this.deps.retry?.onRetry?.(info);
          },
        });

        const normalised = this.deps.normalise(raw, {
          criteria,
          logger: this.logger.child('normalise'),
        });
        const ranked = rankJourneys(normalised.journeys, criteria);
        const result: SearchResult = { ...normalised, journeys: ranked };

        let validated: SearchResult;
        try {
          validated = searchResultSchema.parse(result);
        } catch (parseErr) {
          throw new ProviderError(
            'PROVIDER_FAILURE',
            `Engine produced an invalid SearchResult: ${describeError(parseErr)}`,
          );
        }

        this.deps.cache.set(key, validated);
        return validated;
      } catch (err) {
        if (opts?.signal?.aborted) {
          // Caller abort: propagate unchanged, stop everything — no fallback.
          throw err;
        }
        if (isTerminalProviderError(err)) {
          // Terminal domain error: the answer is the answer — never fall through.
          throw err;
        }

        // Infrastructure failure (ProviderError('PROVIDER_FAILURE') or any
        // HttpError) after retries exhausted — log and fall through.
        this.logger.warn('adapter failed, falling back to next adapter', {
          adapterId: adapter.id,
          error: describeError(err),
        });
        lastError = err;
      }
    }

    throw new ProviderError(
      'PROVIDER_FAILURE',
      `All flight adapters failed. Last error: ${describeError(lastError)}`,
    );
  }

  async getJourney(journeyId: string, criteria: SearchCriteria): Promise<Journey | null> {
    const r = await this.searchJourneys(criteria);
    return r.journeys.find((j) => j.id === journeyId) ?? null;
  }
}

/** Builds a `FlightEngine` with production defaults, shallow-merged with `overrides`. */
export function createFlightEngine(overrides: Partial<FlightEngineDeps> = {}): FlightEngine {
  const deps: FlightEngineDeps = {
    adapters: selectAdapters({ httpProvider: isEnabled('httpProvider') }),
    cache: createTtlCache<SearchResult>({ ttlMs: 300_000, maxEntries: 50 }),
    normalise: defaultNormalise,
    logger: log.child('flight-engine'),
    ...overrides,
  };
  return new FlightEngine(deps);
}
