import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Player } from "@/features/fpl";
import type { FixtureAnalysisMap } from "@/features/fixtures";
import { PlayerCard } from "./PlayerCard";

const ESTIMATED_CARD_HEIGHT = 168;
const GAP = 12;

interface PlayerCardListProps {
  players: Player[];
  fixtures?: FixtureAnalysisMap;
  renderAction?: (player: Player) => ReactNode;
}

/** Virtualized, single-column card list for mobile / narrow viewports. */
export function PlayerCardList({
  players,
  fixtures,
  renderAction,
}: PlayerCardListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: players.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT + GAP,
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height + GAP,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[72vh] overflow-auto rounded-lg"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const player = players[item.index];
          if (!player) return null;
          return (
            <div
              key={player.id}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <PlayerCard
                player={player}
                action={renderAction?.(player)}
                fixtureAnalysis={fixtures?.get(player.teamId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
