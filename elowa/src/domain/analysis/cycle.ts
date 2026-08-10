/**
 * Cycle analysis.
 *
 * Derives observed cycles from recorded period days and produces *historical*,
 * cautious statistics only. elowa deliberately does NOT predict a next period
 * or calculate a fertile window.
 */

import type { CycleEntry, PeriodEntry } from '@/domain/models';
import { daysBetween, type IsoDate } from '@/lib/date';
import { CYCLE } from './thresholds';
import { round1 } from './stats';

/** Group recorded period days into bleeds and derive cycles (start → next start). */
export function deriveCycles(periods: readonly PeriodEntry[]): CycleEntry[] {
  const sorted = [...periods].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  // Group consecutive bleed days (bridging small gaps, e.g. spotting pauses).
  const groups: PeriodEntry[][] = [];
  let current: PeriodEntry[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (daysBetween(prev.date, cur.date) <= CYCLE.MAX_BLEED_GAP + 1) {
      current.push(cur);
    } else {
      groups.push(current);
      current = [cur];
    }
  }
  groups.push(current);

  return groups.map((group, i): CycleEntry => {
    const startDate = group[0]!.date;
    const bleedEndDate = group[group.length - 1]!.date;
    const next = groups[i + 1];
    const lengthDays = next ? daysBetween(startDate, next[0]!.date) : undefined;
    return {
      id: `cycle_${startDate}`,
      startDate,
      bleedEndDate,
      periodDays: daysBetween(startDate, bleedEndDate) + 1,
      ...(lengthDays !== undefined ? { lengthDays } : {}),
    };
  });
}

export interface CycleStats {
  cycleCount: number;
  /** Completed cycle lengths (excludes the in-progress current cycle). */
  recentLengths: number[];
  averageLength?: number;
  /** Range of recent cycle lengths (max − min). */
  variability?: number;
  averagePeriodDays?: number;
  lastPeriodStart?: IsoDate;
}

export function cycleStats(cycles: readonly CycleEntry[]): CycleStats {
  const lengths = cycles
    .map((c) => c.lengthDays)
    .filter((n): n is number => typeof n === 'number');
  const recentLengths = lengths.slice(-3);
  const periodDays = cycles.map((c) => c.periodDays).filter((n) => n > 0);

  return {
    cycleCount: cycles.length,
    recentLengths,
    ...(lengths.length > 0
      ? { averageLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) }
      : {}),
    ...(recentLengths.length >= CYCLE.MIN_CYCLES_FOR_STATS
      ? { variability: Math.max(...recentLengths) - Math.min(...recentLengths) }
      : {}),
    ...(periodDays.length > 0
      ? { averagePeriodDays: round1(periodDays.reduce((a, b) => a + b, 0) / periodDays.length) }
      : {}),
    ...(cycles.length > 0 ? { lastPeriodStart: cycles[cycles.length - 1]!.startDate } : {}),
  };
}
