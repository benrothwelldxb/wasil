import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PlayerAvatar } from "@/features/player-explorer";
import { cn } from "@/lib/utils";
import type { PlayerScore } from "../types";
import { RatingBadge } from "./RatingBadge";

const ROW_HEIGHT = 60;

interface ScoreListProps {
  scores: PlayerScore[];
  selectedId: number | null;
  onSelect: (playerId: number) => void;
}

/** Virtualized, ranked list of scored players. */
export function ScoreList({ scores, selectedId, onSelect }: ScoreListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: scores.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[72vh] overflow-auto rounded-lg border bg-card"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const score = scores[item.index];
          if (!score) return null;
          const { player } = score;
          const selected = player.id === selectedId;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelect(player.id)}
              className={cn(
                "absolute left-0 top-0 flex w-full items-center gap-3 border-b px-3 text-left transition-colors",
                selected ? "bg-accent" : "hover:bg-muted/40",
              )}
              style={{
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                {score.rank}
              </span>
              <PlayerAvatar photoUrl={player.photoUrl} name={player.webName} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {player.webName}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {player.teamShortName} · {player.positionShortName} · £
                  {player.price.now.toFixed(1)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <RatingBadge rating={score.overallRating} size="sm" />
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {score.expectedPoints.toFixed(1)} xP
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
