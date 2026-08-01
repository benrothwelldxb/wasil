import { api } from "@/services/api";

/** `/entry/{id}/` — manager & team summary (public, read-only). */
interface FplEntryRaw {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
  summary_overall_rank: number | null;
  /** The gameweek the manager currently has a saved team for; null preseason. */
  current_event: number | null;
  last_deadline_bank: number | null;
  last_deadline_value: number | null;
}

/** One of the 15 picks in `/entry/{id}/event/{gw}/picks/`. */
interface FplPickRaw {
  element: number;
  /** 1–11 = starters, 12–15 = bench order. */
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface FplPicksRaw {
  picks: FplPickRaw[];
  entry_history?: { bank: number; value: number };
  active_chip?: string | null;
}

/** A manager's real, last-saved FPL team, normalised for the app. */
export interface ManagerTeam {
  entryId: number;
  managerName: string;
  teamName: string;
  gameweek: number;
  /** All 15 player ids, in pick order (starters 1–11, bench 12–15). */
  playerIds: number[];
  captainId: number | null;
  viceId: number | null;
  benchIds: number[];
  /** Player id → scoring multiplier (1 starter, 2 captain, 3 triple, 0 bench). */
  multipliers: Record<number, number>;
  /** Active chip this gameweek (e.g. "3xc", "bboost", "freehit"), or null. */
  activeChip: string | null;
  /** Money in the bank, in tenths of a million. */
  bankTenths: number;
  /** Squad value, in tenths of a million. */
  valueTenths: number;
  overallRank: number | null;
}

const entryPath = (id: number) => `/entry/${id}/`;
const picksPath = (id: number, event: number) =>
  `/entry/${id}/event/${event}/picks/`;

/**
 * Fetch and normalise a manager's real team by their FPL Manager ID (the number
 * in their team URL). Two public calls: the entry summary (for the current
 * gameweek + identity) then that gameweek's picks. Throws a friendly error if
 * the id is unknown or the manager has no saved team yet.
 */
export async function fetchManagerTeam(
  entryId: number,
  signal?: AbortSignal,
): Promise<ManagerTeam> {
  const entry = await api.get<FplEntryRaw>(entryPath(entryId), { signal });
  const gw = entry.current_event;
  if (gw == null) {
    throw new Error("This manager hasn't saved a team yet this season.");
  }

  const picks = await api.get<FplPicksRaw>(picksPath(entryId, gw), { signal });
  const sorted = [...picks.picks].sort((a, b) => a.position - b.position);

  const multipliers: Record<number, number> = {};
  for (const p of sorted) multipliers[p.element] = p.multiplier;

  return {
    entryId,
    managerName:
      `${entry.player_first_name} ${entry.player_last_name}`.trim() ||
      "Manager",
    teamName: entry.name,
    gameweek: gw,
    playerIds: sorted.map((p) => p.element),
    captainId: sorted.find((p) => p.is_captain)?.element ?? null,
    viceId: sorted.find((p) => p.is_vice_captain)?.element ?? null,
    benchIds: sorted.filter((p) => p.position >= 12).map((p) => p.element),
    multipliers,
    activeChip: picks.active_chip ?? null,
    bankTenths: picks.entry_history?.bank ?? entry.last_deadline_bank ?? 0,
    valueTenths: picks.entry_history?.value ?? entry.last_deadline_value ?? 0,
    overallRank: entry.summary_overall_rank ?? null,
  };
}
