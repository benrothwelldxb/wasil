/**
 * The single swap point for the hotel data source. Everything upstream calls
 * `getHotelProvider()` (or the `getStopoverAccommodation` convenience
 * wrapper); replacing the synthetic engine with a real hotel API means
 * changing only this file.
 *
 * A lazy module singleton so importing this module never eagerly constructs
 * the provider as a side effect.
 */
import type { HotelProvider, HotelSearchRequest, StopoverAccommodation } from '@/domain/hotels/types';
import { syntheticHotelProvider } from './SyntheticHotelProvider';

let provider: HotelProvider | null = null;

export function getHotelProvider(): HotelProvider {
  return (provider ??= syntheticHotelProvider);
}

/** Convenience wrapper: fetch accommodation through the registered provider. */
export function getStopoverAccommodation(
  req: HotelSearchRequest,
  opts?: { signal?: AbortSignal },
): Promise<StopoverAccommodation> {
  return getHotelProvider().getAccommodation(req, opts);
}

/** Test-only: clears the singleton so the next `getHotelProvider()` call rebuilds it. */
export function resetHotelProviderForTests(): void {
  provider = null;
}
