import type { Fixture } from "@/features/fpl";

/**
 * How a single gameweek looks across the whole league — the raw material for
 * blank/double-gameweek planning. A "blank" club has no fixture that week; a
 * "double" club has two or more.
 */
export interface GameweekOutlook {
  event: number;
  /** Clubs with at least one fixture this gameweek. */
  playingTeams: number;
  /** Clubs with no fixture this gameweek (a blank). */
  blankTeams: number;
  /** Clubs with two or more fixtures this gameweek (a double). */
  doubleTeams: number;
}

/** Upcoming gameweeks in ascending order, each with its blank/double counts. */
export type GameweekCalendar = GameweekOutlook[];

/**
 * Build the forward-looking gameweek calendar from the raw season fixtures.
 *
 * Groups every unfinished, scheduled fixture by gameweek, then counts — against
 * the full list of clubs — how many blank (0 fixtures) and how many double
 * (2+ fixtures). Pure and inspectable; drives chip planning ("hold your Free
 * Hit — GW29 is a big blank").
 *
 * @param fixtures    the whole season's fixtures (finished ones are ignored)
 * @param allTeamIds  every club id, so blanks can be counted as absences
 */
export function buildGameweekCalendar(
  fixtures: Fixture[],
  allTeamIds: number[],
): GameweekCalendar {
  // event → (teamId → fixture count that gameweek)
  const byEvent = new Map<number, Map<number, number>>();

  for (const fx of fixtures) {
    if (fx.event === null || fx.finished) continue;
    let counts = byEvent.get(fx.event);
    if (!counts) {
      counts = new Map();
      byEvent.set(fx.event, counts);
    }
    counts.set(fx.homeTeamId, (counts.get(fx.homeTeamId) ?? 0) + 1);
    counts.set(fx.awayTeamId, (counts.get(fx.awayTeamId) ?? 0) + 1);
  }

  const calendar: GameweekCalendar = [];
  for (const [event, counts] of byEvent) {
    let playingTeams = 0;
    let doubleTeams = 0;
    for (const id of allTeamIds) {
      const n = counts.get(id) ?? 0;
      if (n >= 1) playingTeams += 1;
      if (n >= 2) doubleTeams += 1;
    }
    calendar.push({
      event,
      playingTeams,
      blankTeams: allTeamIds.length - playingTeams,
      doubleTeams,
    });
  }

  return calendar.sort((a, b) => a.event - b.event);
}
