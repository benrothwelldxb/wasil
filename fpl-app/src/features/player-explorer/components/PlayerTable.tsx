import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Player } from "@/features/fpl";
import {
  FixtureRatingBadge,
  FixtureRun,
  type FixtureAnalysisMap,
} from "@/features/fixtures";
import { cn } from "@/lib/utils";
import { formatColumnValue, gridTemplate, tableMinWidth } from "../columns";
import type { PlayerColumn, PlayerSort, PlayerSortKey } from "../types";
import { PlayerAvatar } from "./PlayerAvatar";
import { PositionBadge } from "./PositionBadge";
import { TeamBadge } from "./TeamBadge";

const ROW_HEIGHT = 56;
const ACTION_WIDTH = 48;

interface PlayerTableProps {
  players: Player[];
  columns: PlayerColumn[];
  sort: PlayerSort;
  onToggleSort: (key: PlayerSortKey) => void;
  fixtures?: FixtureAnalysisMap;
  renderAction?: (player: Player) => ReactNode;
}

function renderCell(
  column: PlayerColumn,
  player: Player,
  fixtures?: FixtureAnalysisMap,
): ReactNode {
  switch (column.key) {
    case "name":
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <PlayerAvatar photoUrl={player.photoUrl} name={player.webName} />
          <div className="min-w-0">
            <div className="truncate font-medium">{player.webName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {player.teamShortName} · {player.positionShortName}
            </div>
          </div>
        </div>
      );
    case "team":
      return (
        <div className="flex items-center gap-2">
          <TeamBadge
            teamCode={player.teamCode}
            teamShortName={player.teamShortName}
          />
          <span className="text-sm">{player.teamShortName}</span>
        </div>
      );
    case "position":
      return <PositionBadge shortName={player.positionShortName} />;
    case "fixtureRun":
      return <FixtureRun analysis={fixtures?.get(player.teamId)} count={5} />;
    case "fixtureNext3": {
      const w = fixtures?.get(player.teamId)?.next3;
      return w ? <FixtureRatingBadge window={w} /> : null;
    }
    case "fixtureNext5": {
      const w = fixtures?.get(player.teamId)?.next5;
      return w ? <FixtureRatingBadge window={w} /> : null;
    }
    default:
      return (
        <span className="tabular-nums">
          {formatColumnValue(player, column.key)}
        </span>
      );
  }
}

export function PlayerTable({
  players,
  columns,
  sort,
  onToggleSort,
  fixtures,
  renderAction,
}: PlayerTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: players.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const hasAction = Boolean(renderAction);
  const template = hasAction
    ? `${ACTION_WIDTH}px ${gridTemplate(columns)}`
    : gridTemplate(columns);
  const minWidth = tableMinWidth(columns) + (hasAction ? ACTION_WIDTH : 0);

  return (
    <div
      ref={parentRef}
      className="relative max-h-[70vh] overflow-auto rounded-lg border bg-card"
    >
      <div style={{ minWidth }}>
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 grid border-b bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/40"
          style={{ gridTemplateColumns: template }}
        >
          {hasAction && <div aria-hidden />}
          {columns.map((col) => {
            const active = sort.key === col.key;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => onToggleSort(col.key)}
                className={cn(
                  "flex items-center gap-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
                  col.align === "right" ? "justify-end" : "justify-start",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{col.label}</span>
                {active ? (
                  sort.direction === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                )}
              </button>
            );
          })}
        </div>

        {/* Virtualized rows */}
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const player = players[item.index];
            if (!player) return null;
            return (
              <div
                key={player.id}
                className="absolute left-0 top-0 grid w-full items-center border-b text-sm transition-colors hover:bg-muted/40"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                  gridTemplateColumns: template,
                }}
              >
                {renderAction && (
                  <div className="flex items-center justify-center">
                    {renderAction(player)}
                  </div>
                )}
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={cn(
                      "min-w-0 px-3",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {renderCell(col, player, fixtures)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
