/**
 * Health-data provider abstraction (Phase 2).
 *
 * elowa's domain layer never talks to HealthKit or Health Connect directly.
 * Instead it depends on this provider interface. A native app wrapper would
 * implement it against the real platform APIs; on the web we ship an
 * "unsupported" provider (honest: nothing is connected) and a deterministic
 * mock provider used only in demo mode.
 *
 * Every read carries an explicit status so the UI can distinguish "not
 * supported" from "permission denied" from "no data" — and never claims data is
 * connected when it is not.
 */

import type {
  HealthDaySample,
  HealthMetricKind,
  HealthPermission,
  MetricStatus,
} from '@/domain/models';
import type { IsoDate } from '@/lib/date';

export type { MetricStatus };

export interface MetricResult<T> {
  status: MetricStatus;
  value?: T;
  /** Present when status is a problem the UI should explain. */
  message?: string;
}

export type HealthPlatform = 'mock' | 'web-unsupported' | 'ios-healthkit' | 'android-health-connect';

export interface HealthProviderCapabilities {
  platform: HealthPlatform;
  label: string;
  /** True when the runtime can actually talk to a health platform. */
  connectable: boolean;
  supported: HealthMetricKind[];
}

export interface HealthDataProvider {
  capabilities(): HealthProviderCapabilities;
  isSupported(kind: HealthMetricKind): boolean;
  getPermissions(): HealthPermission[];
  /** Request permissions; returns the resulting grant state per metric. */
  requestPermissions(kinds: HealthMetricKind[]): Promise<HealthPermission[]>;
  revokeAll(): Promise<void>;
  /** Read daily samples for an inclusive date range. */
  getDailySamples(start: IsoDate, end: IsoDate): Promise<MetricResult<HealthDaySample[]>>;
}

export const ALL_HEALTH_METRICS: HealthMetricKind[] = [
  'sleep_duration',
  'sleep_consistency',
  'steps',
  'active_minutes',
  'workouts',
  'resting_heart_rate',
  'hrv',
  'weight',
];

export const METRIC_LABEL: Record<HealthMetricKind, string> = {
  sleep_duration: 'Sleep duration',
  sleep_consistency: 'Sleep consistency',
  steps: 'Steps',
  active_minutes: 'Active minutes',
  workouts: 'Workouts',
  resting_heart_rate: 'Resting heart rate',
  hrv: 'Heart-rate variability',
  weight: 'Weight',
};
