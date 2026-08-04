/**
 * Selects which adapters the `FlightEngine` should try, and in what order,
 * for a given flag snapshot. Pure function of its argument — it never reads
 * flags itself, so callers (and tests) control exactly what it sees.
 */
import type { FlightAdapter } from './FlightAdapter';
import { httpFlightAdapter } from './HttpFlightAdapter';
import { syntheticFlightAdapter } from './SyntheticFlightAdapter';

export interface AdapterSelectionFlags {
  httpProvider: boolean;
}

/**
 * `httpProvider: false` → synthetic only.
 * `httpProvider: true` → HTTP first, synthetic second as a silent fallback.
 */
export function selectAdapters(flags: AdapterSelectionFlags): readonly FlightAdapter[] {
  return flags.httpProvider
    ? [httpFlightAdapter, syntheticFlightAdapter]
    : [syntheticFlightAdapter];
}
