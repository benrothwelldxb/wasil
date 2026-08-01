import type { Player } from "@/features/fpl";
import { clamp } from "@/utils";
import { MINUTES } from "../config";
import type { MinutesModel } from "../types";

/**
 * Availability multiplier from injury/suspension status.
 *
 * Uses the API's explicit `chanceOfPlayingNextRound` when present; otherwise
 * falls back to a status-based default (injured/suspended ⇒ 0).
 */
export function availabilityFactor(player: Player): number {
  if (player.chanceOfPlayingNextRound !== null) {
    return clamp(player.chanceOfPlayingNextRound / 100, 0, 1);
  }
  return MINUTES.availabilityByStatus[player.availability] ?? 1;
}

/**
 * Expected-minutes / rotation model.
 *
 *   baselineMinsPerGame = minutes ÷ gamesPlayed
 *   xMins               = baselineMinsPerGame × availability   (cap 90)
 *   p60                 = availability × ramp(baseline; 30→75 mins)
 *   pPlay               = availability × ramp(baseline; 0→25 mins)
 */
/** Build a minutes model from raw baselines — reused for counterfactuals. */
export function minutesFromBaseline(
  baselineMinsPerGame: number,
  startRate: number,
  availability: number,
): MinutesModel {
  const xMins = clamp(baselineMinsPerGame * availability, 0, 90);
  const p60 =
    availability *
    clamp(
      (baselineMinsPerGame - MINUTES.min60Low) /
        (MINUTES.min60High - MINUTES.min60Low),
      0,
      1,
    );
  const pPlay =
    availability * clamp(baselineMinsPerGame / MINUTES.minPlayFull, 0, 1);

  return {
    availability,
    baselineMinsPerGame,
    startRate,
    xMins,
    pPlay,
    p60,
    rotationRisk: 1 - p60,
  };
}

export function computeMinutes(
  player: Player,
  gamesPlayed: number,
): MinutesModel {
  const availability = availabilityFactor(player);
  const games = Math.max(gamesPlayed, 1);
  return minutesFromBaseline(
    clamp(player.minutes / games, 0, 90),
    clamp(player.starts / games, 0, 1),
    availability,
  );
}
