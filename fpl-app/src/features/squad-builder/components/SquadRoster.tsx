import { X } from "lucide-react";
import type { Player, Position } from "@/features/fpl";
import { PlayerAvatar, TeamBadge } from "@/features/player-explorer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import { POSITION_FALLBACK, POSITION_ORDER, POSITION_TARGETS } from "../rules";
import type { UseSquadResult } from "../useSquad";

interface SquadRosterProps {
  squad: UseSquadResult;
  positions: Position[];
}

function PlayerRow({
  player,
  onRemove,
}: {
  player: Player;
  onRemove: (player: Player) => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-md border bg-background p-2">
      <PlayerAvatar photoUrl={player.photoUrl} name={player.webName} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{player.webName}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TeamBadge
            teamCode={player.teamCode}
            teamShortName={player.teamShortName}
            size={12}
          />
          {player.teamShortName}
        </div>
      </div>
      <span className="text-sm font-semibold tabular-nums">
        £{player.price.now.toFixed(1)}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${player.webName}`}
        onClick={() => onRemove(player)}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

function EmptySlot({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60 text-xs">
        +
      </span>
      Empty {label} slot
    </li>
  );
}

/** The current squad, grouped by position, with remove controls and empty slots. */
export function SquadRoster({ squad, positions }: SquadRosterProps) {
  const shortById = new Map(positions.map((p) => [p.id, p.shortName]));
  const nameById = new Map(positions.map((p) => [p.id, p.name]));

  if (squad.size === 0) {
    return (
      <EmptyState
        title="No players yet"
        description="Add players from the list to start building your squad."
      />
    );
  }

  return (
    <div className="space-y-4">
      {POSITION_ORDER.map((id) => {
        const inPosition = squad.players.filter((p) => p.positionId === id);
        const target = POSITION_TARGETS[id] ?? 0;
        const emptyCount = Math.max(0, target - inPosition.length);
        const short = shortById.get(id) ?? POSITION_FALLBACK[id]?.short ?? "?";
        const name = nameById.get(id) ?? POSITION_FALLBACK[id]?.name ?? "";

        return (
          <div key={id}>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{name}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {inPosition.length}/{target}
              </span>
            </div>
            <ul className="space-y-1.5">
              {inPosition.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  onRemove={squad.removePlayer}
                />
              ))}
              {Array.from({ length: emptyCount }, (_, i) => (
                <EmptySlot key={`empty-${id}-${i}`} label={short} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
