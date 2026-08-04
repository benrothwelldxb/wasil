/**
 * Selects which adapters the `FlightEngine` should try, and in what order,
 * for a given flag snapshot. Pure function of its argument — it never reads
 * flags itself, so callers (and tests) control exactly what it sees.
 */
import type { FlightAdapter } from './FlightAdapter';
import { httpFlightAdapter } from './HttpFlightAdapter';
import { syntheticFlightAdapter } from './SyntheticFlightAdapter';
import { stopoverDiscoveryAdapter } from '@/data/stopover/StopoverDiscoveryAdapter';

export interface AdapterSelectionFlags {
  httpProvider: boolean;
  stopoverDiscovery: boolean;
}

/**
 * Synthetic is always present, last, as the ultimate silent fallback.
 * `stopoverDiscovery: true` puts the stopover engine first (primary).
 * `httpProvider: true` puts HTTP next. Composed order when both are on:
 * stopover, http, synthetic.
 */
export function selectAdapters(flags: AdapterSelectionFlags): readonly FlightAdapter[] {
  const adapters: FlightAdapter[] = [];
  if (flags.stopoverDiscovery) adapters.push(stopoverDiscoveryAdapter);
  if (flags.httpProvider) adapters.push(httpFlightAdapter);
  adapters.push(syntheticFlightAdapter);
  return adapters;
}
