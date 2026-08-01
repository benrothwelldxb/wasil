import type { Player } from "@/features/fpl";
import { FIXTURE_COLUMNS, PLAYER_COLUMNS } from "./columns";
import type { PlayerFilterState, PlayerSort, SortContext } from "./types";

/** Compute the [min, max] price bounds (£m) across a player list. */
export function getPriceBounds(players: Player[]): [number, number] {
  if (players.length === 0) return [3.5, 15];
  let min = Infinity;
  let max = -Infinity;
  for (const p of players) {
    if (p.price.now < min) min = p.price.now;
    if (p.price.now > max) max = p.price.now;
  }
  // Round outwards to clean half-million steps.
  return [Math.floor(min * 2) / 2, Math.ceil(max * 2) / 2];
}

/** Apply all active filters to the player list. */
export function filterPlayers(
  players: Player[],
  filters: PlayerFilterState,
): Player[] {
  const query = filters.search.trim().toLowerCase();
  const [minPrice, maxPrice] = filters.priceRange ?? [
    -Infinity,
    Infinity,
  ];

  return players.filter((p) => {
    if (filters.teamId !== null && p.teamId !== filters.teamId) return false;
    if (filters.positionId !== null && p.positionId !== filters.positionId) {
      return false;
    }
    if (p.price.now < minPrice || p.price.now > maxPrice) return false;
    if (p.selectedByPercent < filters.minOwnership) return false;

    if (query) {
      const haystack =
        `${p.webName} ${p.firstName} ${p.secondName} ${p.teamName} ${p.teamShortName}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

const SORT_ACCESSORS = new Map(
  [...PLAYER_COLUMNS, ...FIXTURE_COLUMNS].map((c) => [c.key, c.getSortValue]),
);

const EMPTY_CONTEXT: SortContext = {};

/**
 * Return a new, sorted array. Numeric and string values are compared
 * appropriately; ties fall back to total points then name for stability.
 * `ctx` provides fixture analysis for fixture-derived columns.
 */
export function sortPlayers(
  players: Player[],
  sort: PlayerSort,
  ctx: SortContext = EMPTY_CONTEXT,
): Player[] {
  const accessor = SORT_ACCESSORS.get(sort.key);
  if (!accessor) return players;

  const factor = sort.direction === "asc" ? 1 : -1;

  return [...players].sort((a, b) => {
    const va = accessor(a, ctx);
    const vb = accessor(b, ctx);

    let cmp: number;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }

    if (cmp !== 0) return cmp * factor;

    // Stable tie-breakers.
    const tie = b.totalPoints - a.totalPoints;
    if (tie !== 0) return tie;
    return a.webName.localeCompare(b.webName);
  });
}
