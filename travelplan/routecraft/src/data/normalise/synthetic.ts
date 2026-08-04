/**
 * Normalisation for the synthetic provider's payload. The synthetic engine
 * already emits domain-shaped `Journey`s, but they are still UNTRUSTED at
 * this boundary — each one is re-validated against `journeySchema` and
 * dropped (with a warning) rather than trusted blindly. We never re-rank
 * here: `rankJourneys` is idempotent and the search engine owns ranking.
 */
import type { Journey, SearchResult } from '@/domain/types';
import { journeySchema } from '@/domain/schemas';
import type { SyntheticRawPayload } from './raw-types';
import type { NormaliseContext } from './normalise';

export function normaliseSynthetic(
  raw: SyntheticRawPayload,
  ctx: NormaliseContext,
): SearchResult {
  const validJourneys: Journey[] = [];

  for (const journey of raw.result.journeys) {
    const parsed = journeySchema.safeParse(journey);
    if (!parsed.success) {
      ctx.logger.warn('dropped invalid journey', {
        source: 'synthetic-v1',
        id: journey.id,
        issueCount: parsed.error.issues.length,
      });
      continue;
    }
    validJourneys.push(parsed.data);
  }

  return { ...raw.result, journeys: validJourneys };
}
