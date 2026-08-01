import { api } from "@/services/api";

/** A player's live figures for the in-progress gameweek. */
export interface LivePlayerStat {
  /** Live total points (includes bonus once the fixture is finalised). */
  total: number;
  minutes: number;
}

export type LiveMap = Map<number, LivePlayerStat>;

interface FplLiveElementRaw {
  id: number;
  stats: { total_points: number; minutes: number };
}
interface FplLiveRaw {
  elements: FplLiveElementRaw[];
}

/**
 * Fetch live per-player points for a gameweek (`/event/{gw}/live/`). Updates
 * through the day as matches are played.
 */
export async function fetchEventLive(
  event: number,
  signal?: AbortSignal,
): Promise<LiveMap> {
  const raw = await api.get<FplLiveRaw>(`/event/${event}/live/`, { signal });
  const map: LiveMap = new Map();
  for (const el of raw.elements) {
    map.set(el.id, { total: el.stats.total_points, minutes: el.stats.minutes });
  }
  return map;
}
