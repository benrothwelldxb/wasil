/**
 * Player Explorer feature — public API.
 *
 * A responsive, virtualized, filterable/sortable view of every FPL player.
 * Built on the `fpl` data layer; no squad-builder logic.
 */
export * from "./components";
export { usePlayerExplorer } from "./usePlayerExplorer";
export { useWatchlistStore } from "./watchlistStore";
export type { UsePlayerExplorerResult } from "./usePlayerExplorer";
export {
  filterPlayers,
  sortPlayers,
  getPriceBounds,
} from "./filtering";
export { PLAYER_COLUMNS, SORT_OPTIONS, OWNERSHIP_OPTIONS } from "./columns";
export type {
  PlayerFilterState,
  PlayerSort,
  PlayerSortKey,
  PlayerColumn,
  SortDirection,
} from "./types";
