import type { Player } from "@/features/fpl";
import { clamp } from "@/utils";
import { CONFIDENCE, type PredictionWindow } from "../config";
import type { MinutesModel } from "../types";

/**
 * Confidence (0–100) that the prediction is reliable.
 *
 *   raw   = base + sampleWeight × sampleConf + starterWeight × p60
 *   final = clamp(raw) × horizonDecay[window]
 *
 * More minutes (bigger sample) and nailed starters ⇒ higher confidence;
 * further horizons decay because uncertainty compounds.
 */
export function computeConfidence(
  player: Player,
  mins: MinutesModel,
  window: PredictionWindow,
): number {
  const sampleConf = clamp(
    player.minutes / CONFIDENCE.fullSampleMinutes,
    0,
    1,
  );
  const raw =
    CONFIDENCE.base +
    CONFIDENCE.sampleWeight * sampleConf +
    CONFIDENCE.starterWeight * mins.p60;

  const decay = CONFIDENCE.horizonDecay[window] ?? 0.6;
  const value = clamp(raw, 0, 1) * decay;

  return Math.round(
    clamp(value, CONFIDENCE.floor, CONFIDENCE.ceil) * 100,
  );
}
