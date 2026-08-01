import type { Lineup, LineupProjection, LitePlayer } from "./types";
import { formationOf } from "./autopick";

/**
 * Projected score for a lineup. Player values are already *expected* points
 * (they bake in playing probability), so the captain simply counts twice:
 *
 *   total = Σ(starting XI) + captain value
 *
 * The vice-captain is the contingency if the captain doesn't feature, so it
 * isn't added to the headline number.
 */
export function projectLineup(
  lineup: Lineup,
  playersById: Map<number, LitePlayer>,
): LineupProjection {
  const starters = lineup.starterIds
    .map((id) => playersById.get(id))
    .filter((p): p is LitePlayer => p !== undefined);

  const base = starters.reduce((sum, p) => sum + p.value, 0);
  const captain =
    lineup.captainId !== null ? playersById.get(lineup.captainId) : undefined;
  const captainBonus = captain?.value ?? 0;

  return {
    base,
    captainBonus,
    total: base + captainBonus,
    formation: formationOf(starters),
  };
}
