/**
 * Health provider implementations.
 *
 * - `UnsupportedHealthProvider`: the honest web default. Nothing is connectable;
 *   reads return `unsupported`. This is what a browser build uses.
 * - `MockHealthProvider`: a deterministic provider used ONLY in demo mode to
 *   demonstrate passive-data features. Reads from whatever samples the demo
 *   seeded (via the health repository) and honours a stored permission grant.
 *
 * A native wrapper (Phase 2.x) would add HealthKit / Health Connect providers
 * implementing the same interface — see `docs/HEALTH.md`.
 */

import type { HealthMetricKind, HealthPermission } from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import { daysBetween } from '@/lib/date';
import { healthRepository } from '@/services/repositories/healthRepository';
import type { HealthDataProvider, HealthProviderCapabilities, MetricResult } from './types';

const MOCK_SUPPORTED: HealthMetricKind[] = [
  'sleep_duration',
  'sleep_consistency',
  'steps',
  'active_minutes',
  'workouts',
  'resting_heart_rate',
];

export class UnsupportedHealthProvider implements HealthDataProvider {
  capabilities(): HealthProviderCapabilities {
    return {
      platform: 'web-unsupported',
      label: 'This browser',
      connectable: false,
      supported: [],
    };
  }
  isSupported(): boolean {
    return false;
  }
  getPermissions(): HealthPermission[] {
    return [];
  }
  async requestPermissions(): Promise<HealthPermission[]> {
    return [];
  }
  async revokeAll(): Promise<void> {
    /* nothing connected */
  }
  async getDailySamples(): Promise<MetricResult<never[]>> {
    return {
      status: 'unsupported',
      message: 'Connecting health data needs the elowa app on your phone. It is not available in this browser.',
    };
  }
}

export class MockHealthProvider implements HealthDataProvider {
  capabilities(): HealthProviderCapabilities {
    return {
      platform: 'mock',
      label: 'Demo health source',
      connectable: true,
      supported: MOCK_SUPPORTED,
    };
  }
  isSupported(kind: HealthMetricKind): boolean {
    return MOCK_SUPPORTED.includes(kind);
  }
  getPermissions(): HealthPermission[] {
    return healthRepository.getPermissions();
  }
  async requestPermissions(kinds: HealthMetricKind[]): Promise<HealthPermission[]> {
    const perms = MOCK_SUPPORTED.map((kind) => ({ kind, granted: kinds.includes(kind) }));
    healthRepository.setPermissions(perms);
    return perms;
  }
  async revokeAll(): Promise<void> {
    healthRepository.setPermissions(MOCK_SUPPORTED.map((kind) => ({ kind, granted: false })));
  }
  async getDailySamples(start: IsoDate, end: IsoDate) {
    const granted = this.getPermissions().some((p) => p.granted);
    if (!granted) {
      return { status: 'permission_denied' as const, message: 'Permission not granted.' };
    }
    const all = healthRepository.listSamples();
    const inRange = all.filter((s) => daysBetween(start, s.date) >= 0 && daysBetween(s.date, end) >= 0);
    if (inRange.length === 0) return { status: 'no_data' as const, value: [] };
    const span = daysBetween(start, end) + 1;
    const status = inRange.length < span * 0.5 ? ('partial_data' as const) : ('valid' as const);
    return { status, value: inRange };
  }
}
