import type { Player } from "@/features/fpl";
import { formatNumber } from "@/utils";
import type { PlayerColumn, PlayerSortKey } from "./types";

/**
 * Column model for the explorer table. `width` values feed a single CSS grid
 * template shared by the header and every virtualized row so they stay
 * pixel-aligned.
 */
export const PLAYER_COLUMNS: PlayerColumn[] = [
  {
    key: "name",
    label: "Player",
    width: 220,
    align: "left",
    numeric: false,
    getSortValue: (p) => p.webName.toLowerCase(),
  },
  {
    key: "team",
    label: "Team",
    width: 96,
    align: "left",
    numeric: false,
    getSortValue: (p) => p.teamShortName,
  },
  {
    key: "position",
    label: "Pos",
    width: 76,
    align: "left",
    numeric: false,
    getSortValue: (p) => p.positionId,
  },
  {
    key: "price",
    label: "Price",
    width: 84,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.price.now,
  },
  {
    key: "totalPoints",
    label: "Pts",
    width: 72,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.totalPoints,
  },
  {
    key: "selectedByPercent",
    label: "Owned",
    width: 92,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.selectedByPercent,
  },
  {
    key: "form",
    label: "Form",
    width: 78,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.form,
  },
  {
    key: "minutes",
    label: "Min",
    width: 80,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.minutes,
  },
  {
    key: "goalsScored",
    label: "G",
    width: 60,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.goalsScored,
  },
  {
    key: "assists",
    label: "A",
    width: 60,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.assists,
  },
  {
    key: "cleanSheets",
    label: "CS",
    width: 64,
    align: "right",
    numeric: true,
    getSortValue: (p) => p.cleanSheets,
  },
];

/** Total intrinsic width of the table (used as the horizontal-scroll min). */
export const TABLE_MIN_WIDTH = PLAYER_COLUMNS.reduce(
  (sum, c) => sum + c.width,
  0,
);

/** CSS `grid-template-columns` string shared by header and rows. */
export const GRID_TEMPLATE = PLAYER_COLUMNS.map((c) => `${c.width}px`).join(" ");

/** Format a numeric column's value for display. */
export function formatColumnValue(player: Player, key: PlayerSortKey): string {
  switch (key) {
    case "price":
      return `£${player.price.now.toFixed(1)}`;
    case "totalPoints":
      return formatNumber(player.totalPoints);
    case "selectedByPercent":
      return `${player.selectedByPercent.toFixed(1)}%`;
    case "form":
      return player.form.toFixed(1);
    case "minutes":
      return formatNumber(player.minutes);
    case "goalsScored":
      return formatNumber(player.goalsScored);
    case "assists":
      return formatNumber(player.assists);
    case "cleanSheets":
      return formatNumber(player.cleanSheets);
    default:
      return "";
  }
}

/** Ownership threshold options for the filter dropdown. */
export const OWNERSHIP_OPTIONS = [
  { value: 0, label: "Any ownership" },
  { value: 1, label: "Owned by 1%+" },
  { value: 5, label: "Owned by 5%+" },
  { value: 10, label: "Owned by 10%+" },
  { value: 25, label: "Owned by 25%+" },
  { value: 50, label: "Owned by 50%+" },
] as const;

/** Human labels for the sort dropdown (mirrors the table columns). */
export const SORT_OPTIONS: { key: PlayerSortKey; label: string }[] = [
  { key: "totalPoints", label: "Total points" },
  { key: "name", label: "Name" },
  { key: "team", label: "Team" },
  { key: "position", label: "Position" },
  { key: "price", label: "Price" },
  { key: "selectedByPercent", label: "Ownership" },
  { key: "form", label: "Form" },
  { key: "minutes", label: "Minutes" },
  { key: "goalsScored", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "cleanSheets", label: "Clean sheets" },
];
