import type { Player } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";

export type SortDirection = "asc" | "desc";

/** Every column the explorer can sort by. */
export type PlayerSortKey =
  | "name"
  | "team"
  | "position"
  | "price"
  | "totalPoints"
  | "selectedByPercent"
  | "form"
  | "minutes"
  | "goalsScored"
  | "assists"
  | "cleanSheets"
  // Fixture-derived (only present when fixture analysis is supplied)
  | "fixtureRun"
  | "fixtureNext3"
  | "fixtureNext5";

/** Extra context available to column sort accessors. */
export interface SortContext {
  fixtures?: FixtureAnalysisMap;
}

export interface PlayerSort {
  key: PlayerSortKey;
  direction: SortDirection;
}

export interface PlayerFilterState {
  /** Free-text search across player name and club. */
  search: string;
  /** Selected club id, or `null` for all clubs. */
  teamId: number | null;
  /** Selected position id, or `null` for all positions. */
  positionId: number | null;
  /** Inclusive price range in £m, or `null` for the full range. */
  priceRange: [number, number] | null;
  /** Minimum ownership (selected-by) percentage. */
  minOwnership: number;
}

/** Metadata describing a single table column. */
export interface PlayerColumn {
  key: PlayerSortKey;
  label: string;
  /** Fixed column width in px (drives the CSS grid template). */
  width: number;
  align: "left" | "right";
  /** Numeric columns default to descending sort and right alignment. */
  numeric: boolean;
  /** Value used when sorting by this column. */
  getSortValue: (player: Player, ctx: SortContext) => number | string;
}
