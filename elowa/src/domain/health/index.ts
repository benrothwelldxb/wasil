/**
 * Health provider selection.
 *
 * The provider is chosen by runtime capability, never faked:
 * - A native wrapper can set `window.__ELOWA_NATIVE_HEALTH__` and register a
 *   real HealthKit / Health Connect provider (Phase 2.x).
 * - Demo mode uses the deterministic MockHealthProvider so passive-data
 *   features can be demonstrated under the clearly-labelled demo banner.
 * - Otherwise (a normal browser) the UnsupportedHealthProvider is used, and the
 *   UI honestly reports that health data can't be connected here.
 */
import { getDataMode } from '@/services/storage/dataContext';
import { MockHealthProvider, UnsupportedHealthProvider } from './providers';
import type { HealthDataProvider } from './types';

let nativeProvider: HealthDataProvider | null = null;

/** A native wrapper can register its real provider at startup. */
export function registerNativeHealthProvider(provider: HealthDataProvider): void {
  nativeProvider = provider;
}

export function getHealthProvider(): HealthDataProvider {
  if (nativeProvider) return nativeProvider;
  if (getDataMode() === 'demo') return new MockHealthProvider();
  return new UnsupportedHealthProvider();
}

export * from './types';
export { MockHealthProvider, UnsupportedHealthProvider } from './providers';
