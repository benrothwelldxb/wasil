import type { Player } from "@/features/fpl";
import { clamp } from "@/utils";
import { CLEAN_SHEET, XP_MODEL } from "./config";
import { cleanSheetProbability, ratePer90 } from "./metrics";

/** Probability the player features (and starts) next gameweek, 0–1. */
export function playingProbability(player: Player): number {
  if (player.chanceOfPlayingNextRound !== null) {
    return clamp(player.chanceOfPlayingNextRound / 100, 0, 1);
  }
  // Fall back to minutes reliability when the API gives no explicit chance.
  return clamp(player.minutes / 1800, 0, 1);
}

/** Attacking multiplier as fixtures ease. */
function attackMultiplier(fixtureEaseWindow: number): number {
  const { min, max } = XP_MODEL.attackMultiplier;
  return min + (max - min) * clamp(fixtureEaseWindow, 0, 1);
}

/**
 * A transparent Expected Points (xP) estimate for the next gameweek — pure
 * FPL scoring arithmetic, no AI.
 *
 *   xP ≈ pPlay × ( appearance + attack + cleanSheet + bonus )
 *
 * where attacking returns scale with per-90 xG/xA, position point values, and
 * fixture ease; and clean-sheet points scale with clean-sheet probability.
 */
export function computeExpectedPoints(
  player: Player,
  fixtureEaseWindow: number,
  fixtureEaseNext: number,
): number {
  const pPlay = playingProbability(player);
  if (pPlay <= 0) return 0;

  const xg90 = ratePer90(player.expectedGoals, player.minutes);
  const xa90 = ratePer90(player.expectedAssists, player.minutes);

  const goalPts = XP_MODEL.goalPoints[player.positionId] ?? 4;
  const csPts = XP_MODEL.cleanSheetPoints[player.positionId] ?? 0;
  const csFactor = CLEAN_SHEET.positionFactor[player.positionId] ?? 0;

  const attack =
    (xg90 * goalPts + xa90 * XP_MODEL.assistPoints) *
    attackMultiplier(fixtureEaseWindow);

  const cleanSheet =
    cleanSheetProbability(fixtureEaseNext) * csPts * csFactor;

  const bonus = attack * XP_MODEL.bonusFactor;

  const perAppearance =
    XP_MODEL.appearancePoints + attack + cleanSheet + bonus;

  return Math.round(pPlay * perAppearance * 10) / 10;
}
