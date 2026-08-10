/**
 * Deterministic change-point detection (Phase 2).
 *
 * Detects *sustained* change in a measure rather than reacting to one unusual
 * day. It requires a minimum number of days and a minimum share of the recent
 * window to move in the same direction, so single spikes never trigger a
 * "change" insight. All thresholds live in `thresholds.ts`.
 */

import { CHANGEPOINT } from './thresholds';
import { lastN, mean, round1 } from './stats';
import type { MeasureAnalysis } from './measures';

export type ChangeDirection = 'up' | 'down' | 'none';

/** Plain-language magnitude — never a z-score or coefficient. */
export type MagnitudeLabel =
  | 'within_usual'
  | 'slightly_outside'
  | 'noticeably_different'
  | 'sustained_change';

export interface ChangePoint {
  direction: ChangeDirection;
  sustained: boolean;
  recentMean: number;
  baselineMean: number;
  deviation: number;
  windowDays: number;
  /** Days in the recent window that sit in the detected direction. */
  agreeingDays: number;
  magnitude: MagnitudeLabel;
}

export function magnitudeLabel(absDeviation: number, sustained: boolean): MagnitudeLabel {
  if (sustained && absDeviation >= CHANGEPOINT.NOTICEABLE_DELTA) return 'sustained_change';
  if (absDeviation >= CHANGEPOINT.NOTICEABLE_DELTA) return 'noticeably_different';
  if (absDeviation >= CHANGEPOINT.SLIGHT_DELTA) return 'slightly_outside';
  return 'within_usual';
}

export const MAGNITUDE_TEXT: Record<MagnitudeLabel, string> = {
  within_usual: 'within your usual range',
  slightly_outside: 'slightly outside your usual range',
  noticeably_different: 'noticeably different from your usual range',
  sustained_change: 'a sustained change from your usual range',
};

export function detectChange(measure: MeasureAnalysis): ChangePoint {
  const values = measure.days.map((d) => d.value);
  const baselineMean = measure.baseline.mean;
  const window = lastN(measure.days, CHANGEPOINT.WINDOW);
  const recentMean = round1(mean(window.map((d) => d.value)));
  const deviation = round1(recentMean - baselineMean);

  const none: ChangePoint = {
    direction: 'none',
    sustained: false,
    recentMean,
    baselineMean,
    deviation,
    windowDays: window.length,
    agreeingDays: 0,
    magnitude: 'within_usual',
  };

  // Not enough data, or not enough of the window logged.
  if (values.length < CHANGEPOINT.MIN_DAYS || window.length < CHANGEPOINT.MIN_WINDOW) return none;

  const direction: ChangeDirection = deviation > 0 ? 'up' : deviation < 0 ? 'down' : 'none';
  if (direction === 'none' || Math.abs(deviation) < CHANGEPOINT.SLIGHT_DELTA) return none;

  const agreeingDays = window.filter((d) => (direction === 'up' ? d.high : d.low)).length;
  const sustained =
    Math.abs(deviation) >= CHANGEPOINT.SUSTAINED_DELTA &&
    agreeingDays / window.length >= CHANGEPOINT.SUSTAINED_SHARE;

  return {
    direction,
    sustained,
    recentMean,
    baselineMean,
    deviation,
    windowDays: window.length,
    agreeingDays,
    magnitude: magnitudeLabel(Math.abs(deviation), sustained),
  };
}
