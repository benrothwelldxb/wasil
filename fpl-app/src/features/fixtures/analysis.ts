import type { Fixture } from "@/features/fpl";
import { clamp } from "@/utils";
import type {
  FixtureAnalysisMap,
  FixtureWindowRating,
  UpcomingFixture,
} from "./types";

/**
 * Home-advantage weighting applied on top of the raw FPL difficulty when
 * computing ratings: a home game plays ~0.3 FDR easier, an away game ~0.3
 * harder. Tunable in one place.
 */
export const HOME_ADVANTAGE = 0.3;

/** Difficulty after applying the home/away weighting, clamped to 1–5. */
export function effectiveDifficulty(
  rawDifficulty: number,
  isHome: boolean,
): number {
  const venue = isHome ? -HOME_ADVANTAGE : HOME_ADVANTAGE;
  return clamp(rawDifficulty + venue, 1, 5);
}

/** An empty window (no upcoming fixtures) — treated as neutral. */
const EMPTY_WINDOW: FixtureWindowRating = {
  games: 0,
  averageDifficulty: 0,
  rating: 50,
};

/** Rate the first `n` fixtures of an ordered upcoming list, out of 100. */
export function computeWindow(
  ordered: UpcomingFixture[],
  n: number,
): FixtureWindowRating {
  const slice = ordered.slice(0, n);
  if (slice.length === 0) return EMPTY_WINDOW;

  let rawSum = 0;
  let effSum = 0;
  for (const f of slice) {
    rawSum += f.difficulty;
    effSum += effectiveDifficulty(f.difficulty, f.isHome);
  }

  const avgEff = effSum / slice.length;
  // Map effective difficulty 1..5 → 100..0 (easier ⇒ higher rating).
  const rating = clamp(Math.round(((5 - avgEff) / 4) * 100), 0, 100);

  return {
    games: slice.length,
    averageDifficulty: Math.round((rawSum / slice.length) * 100) / 100,
    rating,
  };
}

/** Chronological sort key for upcoming fixtures (unscheduled sort last). */
function chronoKey(f: UpcomingFixture): number {
  if (f.event !== null) return f.event;
  if (f.kickoffTime) return Number(new Date(f.kickoffTime)) / 1e10;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Build per-team fixture analysis from the (normalized) season fixtures.
 *
 * Only unfinished fixtures are considered, so as gameweeks are played and
 * fixtures are marked finished, every window advances automatically — the
 * fixtures query's background refetch keeps this current each gameweek.
 */
export function buildFixtureAnalysisMap(
  fixtures: Fixture[],
): FixtureAnalysisMap {
  const byTeam = new Map<number, UpcomingFixture[]>();

  const push = (teamId: number, fixture: UpcomingFixture) => {
    const list = byTeam.get(teamId);
    if (list) list.push(fixture);
    else byTeam.set(teamId, [fixture]);
  };

  for (const fx of fixtures) {
    if (fx.finished) continue;

    push(fx.homeTeamId, {
      fixtureId: fx.id,
      event: fx.event,
      isHome: true,
      opponentId: fx.awayTeamId,
      opponentShort: fx.awayTeamShort,
      opponentName: fx.awayTeamName,
      difficulty: fx.homeDifficulty,
      kickoffTime: fx.kickoffTime,
    });

    push(fx.awayTeamId, {
      fixtureId: fx.id,
      event: fx.event,
      isHome: false,
      opponentId: fx.homeTeamId,
      opponentShort: fx.homeTeamShort,
      opponentName: fx.homeTeamName,
      difficulty: fx.awayDifficulty,
      kickoffTime: fx.kickoffTime,
    });
  }

  const map: FixtureAnalysisMap = new Map();
  for (const [teamId, list] of byTeam) {
    const ordered = [...list].sort((a, b) => chronoKey(a) - chronoKey(b));
    map.set(teamId, {
      teamId,
      fixtures: ordered,
      next: ordered[0] ?? null,
      next1: computeWindow(ordered, 1),
      next3: computeWindow(ordered, 3),
      next5: computeWindow(ordered, 5),
    });
  }

  return map;
}
