import { useMemo } from "react";
import { useFixtures, useTeams } from "@/features/fpl";
import { buildGameweekCalendar, type GameweekCalendar } from "./calendar";

export interface UseGameweekCalendarResult {
  /** Upcoming gameweeks with blank/double counts, ascending. Empty until data loads. */
  calendar: GameweekCalendar;
  isLoading: boolean;
}

/**
 * The forward-looking blank/double-gameweek calendar, derived from the shared
 * fixtures + teams queries. Refreshes automatically as fixtures are played,
 * because it only counts unfinished fixtures.
 */
export function useGameweekCalendar(): UseGameweekCalendarResult {
  const fixtures = useFixtures();
  const teams = useTeams();

  const calendar = useMemo<GameweekCalendar>(() => {
    if (!fixtures.data || !teams.data) return [];
    return buildGameweekCalendar(
      fixtures.data,
      teams.data.map((t) => t.id),
    );
  }, [fixtures.data, teams.data]);

  return {
    calendar,
    isLoading: fixtures.isLoading || teams.isLoading,
  };
}
