/**
 * Wraps the pure synthetic journey generator (`generateSearchResult`, in
 * `@/data/synthetic/SyntheticJourneyProvider`) behind the `FlightAdapter`
 * seam, returning its RAW payload untouched. Adds the same seeded artificial
 * latency `SyntheticJourneyProvider` uses (only when the `syntheticLatency`
 * flag is on) so loading states are still exercised when this adapter runs
 * inside the `FlightEngine`. Unlike that provider's own internal delay, this
 * one is abort-aware: an aborted `signal` rejects the wait with the caller's
 * abort reason, unchanged, so the engine can distinguish a caller abort from
 * an infrastructure failure.
 */
import type { SearchCriteria } from '@/domain/types';
import type { SyntheticRawPayload } from '@/data/normalise';
import { generateSearchResult } from '@/data/synthetic/SyntheticJourneyProvider';
import { createRng } from '@/data/synthetic/rng';
import { criteriaKey } from '@/domain/url';
import { isEnabled } from '@/config/flags';
import type { FlightAdapter } from './FlightAdapter';

const PROVIDER_ID = 'synthetic-v1';

/** Seeded pseudo-latency (120–520ms) — same shape as `SyntheticJourneyProvider`'s. */
function seededLatencyMs(criteria: SearchCriteria): number {
  const rng = createRng(`latency|${criteriaKey(criteria)}`);
  return 120 + Math.floor(rng.rand() * 400);
}

/**
 * Waits `ms` milliseconds. If `signal` aborts before or during the wait, the
 * returned promise rejects immediately with `signal.reason`, unchanged.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class SyntheticFlightAdapter implements FlightAdapter<SyntheticRawPayload> {
  readonly id = 'synthetic-v1' as const;
  readonly displayName = 'Synthetic Flight Engine';
  readonly supportsGetJourney = true;

  async search(
    criteria: SearchCriteria,
    opts?: { signal?: AbortSignal },
  ): Promise<SyntheticRawPayload> {
    if (isEnabled('syntheticLatency')) {
      await delay(seededLatencyMs(criteria), opts?.signal);
    }
    // ProviderError thrown by generateSearchResult propagates unchanged.
    const result = generateSearchResult(criteria);
    return { source: PROVIDER_ID, result };
  }
}

/** Module-singleton instance — see `adapter-registry.ts`. */
export const syntheticFlightAdapter = new SyntheticFlightAdapter();
