/**
 * Weather sub-model — turns a raw `WeatherSummary` into a pre-normalised
 * 0–100 comfort score. Pinned here (pure domain) so the Journey Score's
 * weather factor is well-defined; the data layer calls this to fill
 * `signals.weather`/`signals.stopovers[i].weather`. See ALGORITHM.md
 * §"Weather sub-model".
 */
import type { WeatherSummary } from '@/domain/hotels/types';
import { clamp } from '@/domain/math';

const BASE_BY_CONDITION: Record<WeatherSummary['condition'], number> = {
  sunny: 92,
  partly_cloudy: 80,
  cloudy: 62,
  rainy: 42,
  snowy: 52,
};

export function weatherComfortScore(w: WeatherSummary): number {
  const base = BASE_BY_CONDITION[w.condition];
  const avgTemp = (w.averageHighC + w.averageLowC) / 2;
  const tempPenalty = Math.abs(avgTemp - 22) * 1.5;
  const precipPenalty = w.precipitationChance * 30;
  return clamp(base - tempPenalty - precipPenalty);
}
