/**
 * Exposes the stopover discovery engine as a `FlightAdapter`. Reuses the
 * existing `SyntheticRawPayload` envelope and `normaliseSynthetic`
 * normaliser — the discovery engine already returns a domain-shaped
 * `SearchResult`, exactly like the synthetic provider does, so no new raw
 * shape or normaliser is needed. This is what lets the stopover engine ride
 * the existing `FlightEngine` pipeline (cache → retry → normalise → rank →
 * validate → fallback) unchanged.
 */
import type { SearchCriteria } from '@/domain/types';
import type { SyntheticRawPayload } from '@/data/normalise';
import type { FlightAdapter } from '@/data/adapters/FlightAdapter';
import { discoverJourneys } from './createStopoverDiscovery';

export class StopoverDiscoveryAdapter implements FlightAdapter<SyntheticRawPayload> {
  readonly id = 'stopover-v1' as const;
  readonly displayName = 'Stopover Discovery Engine';
  readonly supportsGetJourney = true;

  async search(
    criteria: SearchCriteria,
    opts?: { signal?: AbortSignal },
  ): Promise<SyntheticRawPayload> {
    const result = await discoverJourneys(criteria, opts);
    return { source: 'synthetic-v1', result } satisfies SyntheticRawPayload;
  }
}

/** Module-singleton instance — see `adapter-registry.ts`. */
export const stopoverDiscoveryAdapter = new StopoverDiscoveryAdapter();
