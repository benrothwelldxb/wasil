/**
 * Pluggable analytics pipeline. Mirrors the logger's sink pattern: `track()` is
 * the single entry point; the active `AnalyticsSink` decides what happens to an
 * event. Today the default forwards to the logger (dev) or drops (prod); a real
 * backend sink (Segment, a first-party events API, a warehouse loader) is a
 * one-line `setAnalyticsSink()` swap — no call site changes.
 *
 * Deliberately not in `domain/`: this reads the wall clock and generates ids,
 * which is fine for a side-channel but never allowed in the deterministic core.
 */
import { env } from '@/config/env';
import { log } from '@/lib/logger';
import type { AnalyticsEvent } from './events';

export interface AnalyticsEnvelope {
  event: AnalyticsEvent;
  timestamp: number;
  sessionId: string;
  appVersion: string;
}

export interface AnalyticsSink {
  capture(envelope: AnalyticsEnvelope): void;
}

/** Drops everything. The production default until a real sink is configured. */
export const noopSink: AnalyticsSink = {
  capture() {
    /* intentionally empty */
  },
};

const analyticsLogger = log.child('analytics');

/** Forwards events to the structured logger — the dev default. */
export const loggerSink: AnalyticsSink = {
  capture(envelope) {
    analyticsLogger.info(envelope.event.name, {
      event: envelope.event,
      sessionId: envelope.sessionId,
    });
  },
};

export interface MemorySink extends AnalyticsSink {
  readonly events: readonly AnalyticsEnvelope[];
  clear(): void;
}

/** In-memory sink for tests and debugging. */
export function createMemorySink(): MemorySink {
  const events: AnalyticsEnvelope[] = [];
  return {
    events,
    capture(envelope) {
      events.push(envelope);
    },
    clear() {
      events.length = 0;
    },
  };
}

function defaultSink(): AnalyticsSink {
  return env.isDev ? loggerSink : noopSink;
}

let activeSink: AnalyticsSink = defaultSink();
let sessionId: string | null = null;

/** Swap the active sink (e.g. install a real backend sink at app boot). */
export function setAnalyticsSink(sink: AnalyticsSink): void {
  activeSink = sink;
}

function generateSessionId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function currentSessionId(): string {
  if (sessionId === null) {
    sessionId = generateSessionId();
  }
  return sessionId;
}

/** Emit an analytics event through the active sink. Never throws. */
export function track(event: AnalyticsEvent): void {
  try {
    activeSink.capture({
      event,
      timestamp: Date.now(),
      sessionId: currentSessionId(),
      appVersion: env.appVersion,
    });
  } catch (error) {
    // Analytics must never break the app; swallow and log.
    analyticsLogger.warn('analytics sink threw', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Test hook: reset the sink and session between cases. */
export function resetAnalyticsForTests(): void {
  activeSink = defaultSink();
  sessionId = null;
}
