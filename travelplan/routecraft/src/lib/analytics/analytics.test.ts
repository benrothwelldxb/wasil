import { afterEach, describe, expect, it } from 'vitest';
import {
  createMemorySink,
  resetAnalyticsForTests,
  setAnalyticsSink,
  track,
  type AnalyticsSink,
} from './analytics';
import type { AnalyticsEvent } from './events';

const searchEvent: AnalyticsEvent = {
  name: 'search_submitted',
  origin: 'DXB',
  destination: 'MAN',
  maxStopovers: 2,
  maxStopoverNights: 2,
  budgetUsd: 1500,
  travellers: 1,
  cabin: 'economy',
  preferences: ['culture'],
};

afterEach(() => {
  resetAnalyticsForTests();
});

describe('track', () => {
  it('forwards events to the active sink wrapped in an envelope', () => {
    const sink = createMemorySink();
    setAnalyticsSink(sink);

    track(searchEvent);

    expect(sink.events).toHaveLength(1);
    const [envelope] = sink.events;
    expect(envelope.event).toEqual(searchEvent);
    expect(typeof envelope.timestamp).toBe('number');
    expect(envelope.sessionId).toBeTruthy();
    expect(typeof envelope.appVersion).toBe('string');
  });

  it('reuses one session id across events', () => {
    const sink = createMemorySink();
    setAnalyticsSink(sink);

    track(searchEvent);
    track({ name: 'journey_selected', journeyId: 'j1', rank: 0, kind: 'stopover', score: 88, badges: [] });

    expect(sink.events).toHaveLength(2);
    expect(sink.events[0].sessionId).toBe(sink.events[1].sessionId);
  });

  it('never throws even if the sink throws', () => {
    const throwingSink: AnalyticsSink = {
      capture() {
        throw new Error('sink boom');
      },
    };
    setAnalyticsSink(throwingSink);

    expect(() => track(searchEvent)).not.toThrow();
  });

  it('routes to whichever sink is active (swap wins)', () => {
    const a = createMemorySink();
    const b = createMemorySink();
    setAnalyticsSink(a);
    track(searchEvent);
    setAnalyticsSink(b);
    track({ name: 'booking_intent', journeyId: 'j1', kind: 'direct', totalUsd: 900 });

    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
    expect(b.events[0].event.name).toBe('booking_intent');
  });
});

describe('createMemorySink', () => {
  it('captures and clears', () => {
    const sink = createMemorySink();
    sink.capture({ event: searchEvent, timestamp: 1, sessionId: 's', appVersion: 'dev' });
    expect(sink.events).toHaveLength(1);
    sink.clear();
    expect(sink.events).toHaveLength(0);
  });
});
