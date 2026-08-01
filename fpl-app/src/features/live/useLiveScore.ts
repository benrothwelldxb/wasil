import { useMemo } from "react";
import { usePlayers, useFixtures, type FplFixtureRaw } from "@/features/fpl";
import { useManagerTeam } from "@/features/manager";
import { computeProvisionalBonus } from "./bonus";
import { useEventLive } from "./useEventLive";

export type PlayerLiveStatus = "to-play" | "playing" | "played";

export interface LivePlayerRow {
  id: number;
  name: string;
  isStarter: boolean;
  isCaptain: boolean;
  multiplier: number;
  /** Points already counted toward the total (× multiplier). */
  points: number;
  /** Provisional bonus included in `points` (for a subtle "prov." marker). */
  provisionalBonus: number;
  status: PlayerLiveStatus;
}

export interface LiveScore {
  /** True when a real team is connected and the gameweek has kicked off. */
  isLive: boolean;
  /** True when every fixture in the gameweek is finished. */
  finished: boolean;
  gameweek: number | null;
  totalPoints: number;
  starters: LivePlayerRow[];
  bench: LivePlayerRow[];
  toPlay: number;
  playing: number;
  played: number;
  /** Any provisional bonus is included in the total. */
  hasProvisional: boolean;
}

const EMPTY: LiveScore = {
  isLive: false,
  finished: false,
  gameweek: null,
  totalPoints: 0,
  starters: [],
  bench: [],
  toPlay: 0,
  playing: 0,
  played: 0,
  hasProvisional: false,
};

/** Map each club to its fixture status for the gameweek. */
function fixtureStatusByTeam(
  fixtures: FplFixtureRaw[],
  event: number,
): Map<number, PlayerLiveStatus> {
  const status = new Map<number, PlayerLiveStatus>();
  for (const fx of fixtures) {
    if (fx.event !== event) continue;
    const s: PlayerLiveStatus = fx.finished
      ? "played"
      : fx.started
        ? "playing"
        : "to-play";
    status.set(fx.team_h, s);
    status.set(fx.team_a, s);
  }
  return status;
}

/**
 * Live gameweek score for the connected manager's real team: each player's live
 * points (plus provisional bonus for in-play fixtures), captain doubled, bench
 * shown separately, and to-play / playing / played counts.
 */
export function useLiveScore(): LiveScore {
  const { team } = useManagerTeam();
  const playersQuery = usePlayers();
  const fixtures = useFixtures();
  const event = team?.gameweek ?? null;
  const live = useEventLive(event);

  return useMemo<LiveScore>(() => {
    if (!team || event === null || !live.data || !playersQuery.data) {
      return EMPTY;
    }
    const rawFixtures = fixtures.raw ?? [];
    const teamStatus = fixtureStatusByTeam(rawFixtures, event);
    const provisional = computeProvisionalBonus(rawFixtures, event);
    const playersById = new Map(playersQuery.data.map((p) => [p.id, p]));

    // A gameweek is "live" once any of its fixtures has kicked off.
    const anyStarted = rawFixtures.some(
      (fx) => fx.event === event && fx.started,
    );
    const allFinished =
      anyStarted &&
      rawFixtures
        .filter((fx) => fx.event === event)
        .every((fx) => fx.finished);

    const rows: LivePlayerRow[] = team.playerIds.map((id) => {
      const player = playersById.get(id);
      const multiplier = team.multipliers[id] ?? 0;
      const isStarter = multiplier > 0;
      const status = player
        ? (teamStatus.get(player.teamId) ?? "to-play")
        : "to-play";
      const base = live.data.get(id)?.total ?? 0;
      // Provisional bonus only applies while a fixture is in play.
      const prov = status === "playing" ? (provisional.get(id) ?? 0) : 0;
      return {
        id,
        name: player?.webName ?? "—",
        isStarter,
        isCaptain: id === team.captainId,
        multiplier,
        points: (base + prov) * multiplier,
        provisionalBonus: prov * multiplier,
        status,
      };
    });

    const starters = rows.filter((r) => r.isStarter);
    const bench = rows.filter((r) => !r.isStarter);
    const totalPoints = starters.reduce((s, r) => s + r.points, 0);

    // Count against the counting players (starters, unless Bench Boost is on).
    const counting = team.activeChip === "bboost" ? rows : starters;
    return {
      isLive: anyStarted,
      finished: allFinished,
      gameweek: event,
      totalPoints:
        team.activeChip === "bboost"
          ? rows.reduce((s, r) => s + r.points, 0)
          : totalPoints,
      starters,
      bench,
      toPlay: counting.filter((r) => r.status === "to-play").length,
      playing: counting.filter((r) => r.status === "playing").length,
      played: counting.filter((r) => r.status === "played").length,
      hasProvisional: rows.some((r) => r.provisionalBonus > 0),
    };
  }, [team, event, live.data, playersQuery.data, fixtures.raw]);
}
