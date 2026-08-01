import type { Player } from "@/features/fpl";
import { clamp } from "@/utils";
import { CLEAN_SHEET, METRIC_SCALES, type MetricKey } from "./config";

/** Per-90 rate for a season total, damped for small samples. */
export function ratePer90(total: number, minutes: number): number {
  if (minutes <= 0) return 0;
  const denom = Math.max(minutes, METRIC_SCALES.minMinutesForRate);
  return (total * 90) / denom;
}

/**
 * Clean-sheet probability from the next fixture's ease (0 hardest → 1 easiest).
 * `p = base + slope × ease`, capped at `max`.
 */
export function cleanSheetProbability(fixtureEaseNext: number): number {
  return clamp(
    CLEAN_SHEET.base + CLEAN_SHEET.slope * fixtureEaseNext,
    0,
    CLEAN_SHEET.max,
  );
}

/**
 * Compute every metric's normalised value (0–1) for a player.
 *
 * @param fixtureEaseWindow ease over the planning window (fixture metric)
 * @param fixtureEaseNext   ease of the next single fixture (clean-sheet model)
 */
export function computeMetricValues(
  player: Player,
  fixtureEaseWindow: number,
  fixtureEaseNext: number,
): Record<MetricKey, number> {
  const xgi90 = ratePer90(player.expectedGoalInvolvements, player.minutes);
  const goalInvolvement =
    0.5 * clamp((player.goalsScored + player.assists) / METRIC_SCALES.goalsAssists, 0, 1) +
    0.5 * clamp(xgi90 / METRIC_SCALES.xgiPer90, 0, 1);

  const pointsPerMillion =
    player.price.now > 0 ? player.totalPoints / player.price.now : 0;

  return {
    fixture: clamp(fixtureEaseWindow, 0, 1),
    form: clamp(player.form / METRIC_SCALES.form, 0, 1),
    minutes: clamp(player.minutes / METRIC_SCALES.minutes, 0, 1),
    goalInvolvement: clamp(goalInvolvement, 0, 1),
    cleanSheet: cleanSheetProbability(fixtureEaseNext),
    priceEfficiency: clamp(
      pointsPerMillion / METRIC_SCALES.pointsPerMillion,
      0,
      1,
    ),
    ownership: clamp(
      player.selectedByPercent / METRIC_SCALES.ownershipPct,
      0,
      1,
    ),
  };
}
