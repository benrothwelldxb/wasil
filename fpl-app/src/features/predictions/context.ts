import type { Team } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";
import { computeLeagueAverages } from "./model";
import type { PredictionContext } from "./types";

/**
 * Assemble the shared {@link PredictionContext} ONCE per data change. Doing the
 * league-average and gameweek work here (not per player) keeps `predictAll`
 * linear and comfortably inside the sub-second performance target.
 */
export function buildPredictionContext(
  teams: Team[],
  fixtures: FixtureAnalysisMap,
  currentEventId: number | null,
): PredictionContext {
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  // Distinct upcoming gameweeks, ascending.
  const gwSet = new Set<number>();
  for (const analysis of fixtures.values()) {
    for (const fx of analysis.fixtures) {
      if (fx.event !== null) gwSet.add(fx.event);
    }
  }
  const upcomingGameweeks = [...gwSet].sort((a, b) => a - b);

  return {
    teamsById,
    fixtures,
    upcomingGameweeks,
    gamesPlayed: Math.max(currentEventId ?? 1, 1),
    league: computeLeagueAverages(teams),
  };
}
