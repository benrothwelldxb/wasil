import { describe, expect, it } from "vitest";
import type { Fixture } from "@/features/fpl";
import { buildGameweekCalendar } from "./calendar";

/** Minimal fixture stub: the calendar only reads event, teams, finished. */
function fx(
  event: number | null,
  homeTeamId: number,
  awayTeamId: number,
  finished = false,
): Fixture {
  return {
    id: event ?? 0,
    code: 0,
    event,
    kickoffTime: null,
    started: false,
    finished,
    minutes: 0,
    homeTeamId,
    homeTeamName: "",
    homeTeamShort: "",
    homeScore: null,
    homeDifficulty: 3,
    awayTeamId,
    awayTeamName: "",
    awayTeamShort: "",
    awayScore: null,
    awayDifficulty: 3,
  };
}

describe("buildGameweekCalendar", () => {
  const teamIds = [1, 2, 3, 4];

  it("counts a normal gameweek as no blanks and no doubles", () => {
    const cal = buildGameweekCalendar([fx(10, 1, 2), fx(10, 3, 4)], teamIds);
    expect(cal).toHaveLength(1);
    expect(cal[0]).toMatchObject({
      event: 10,
      playingTeams: 4,
      blankTeams: 0,
      doubleTeams: 0,
    });
  });

  it("detects blanks (clubs with no fixture)", () => {
    // Only teams 1 & 2 play in GW11; 3 & 4 blank.
    const cal = buildGameweekCalendar([fx(11, 1, 2)], teamIds);
    expect(cal[0]).toMatchObject({ blankTeams: 2, playingTeams: 2 });
  });

  it("detects doubles (clubs with two fixtures)", () => {
    // Team 1 plays twice in GW12.
    const cal = buildGameweekCalendar(
      [fx(12, 1, 2), fx(12, 3, 1)],
      teamIds,
    );
    expect(cal[0]).toMatchObject({ doubleTeams: 1 });
  });

  it("ignores finished and unscheduled fixtures", () => {
    const cal = buildGameweekCalendar(
      [fx(13, 1, 2, true), fx(null, 3, 4), fx(14, 1, 2)],
      teamIds,
    );
    expect(cal.map((g) => g.event)).toEqual([14]);
  });

  it("returns gameweeks in ascending order", () => {
    const cal = buildGameweekCalendar(
      [fx(20, 1, 2), fx(18, 3, 4), fx(19, 1, 3)],
      teamIds,
    );
    expect(cal.map((g) => g.event)).toEqual([18, 19, 20]);
  });
});
