/**
 * Behavioural analytics abstraction (Phase 2).
 *
 * Analytics are OFF by default and record ONLY coarse behavioural events —
 * never symptom values, notes, or any health data. The sink is abstracted so it
 * can be swapped or disabled; the default sink is a no-op. This exists so that
 * IF analytics are ever enabled, there is a single, auditable choke point.
 */

import { preferencesRepository } from './repositories/preferencesRepository';

export type AnalyticsEvent =
  | 'onboarding_completed'
  | 'checkin_completed'
  | 'insight_opened'
  | 'report_generated'
  | 'since_compared'
  | 'ai_summary_generated'
  | 'health_connect_opened';

/** Only these prop keys are ever allowed, and only primitive non-health values. */
type SafeProps = { surface?: string; kind?: string; count?: number };

export interface AnalyticsSink {
  track(event: AnalyticsEvent, props?: SafeProps): void;
}

class NoopSink implements AnalyticsSink {
  track(): void {
    /* intentionally does nothing */
  }
}

let sink: AnalyticsSink = new NoopSink();

export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

export const analytics = {
  track(event: AnalyticsEvent, props?: SafeProps): void {
    if (!preferencesRepository.getPreferences().analyticsEnabled) return;
    // Strip anything that isn't an allowlisted, non-health primitive.
    const safe: SafeProps = {};
    if (props?.surface) safe.surface = String(props.surface);
    if (props?.kind) safe.kind = String(props.kind);
    if (typeof props?.count === 'number') safe.count = props.count;
    sink.track(event, safe);
  },
};
