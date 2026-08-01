import { PlayerAvatar, TeamBadge } from "@/features/player-explorer";
import { cn } from "@/lib/utils";
import type { OptiPlayer, SelectionReason } from "../types";

interface PlayerLineProps {
  player: OptiPlayer;
  reason?: SelectionReason;
  captain?: boolean;
}

/** One selected player with price, projected points, and the selection reason. */
export function PlayerLine({ player, reason }: PlayerLineProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <PlayerAvatar
        photoUrl={player.player.photoUrl}
        name={player.player.webName}
        size={36}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{player.player.webName}</span>
          <TeamBadge
            teamCode={player.player.teamCode}
            teamShortName={player.player.teamShortName}
            size={14}
          />
        </div>
        {reason && (
          <p className="mt-0.5 text-xs text-muted-foreground">{reason.reason}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums">
          {player.value.toFixed(1)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          £{(player.cost / 10).toFixed(1)}m
        </div>
      </div>
    </div>
  );
}

interface PositionGroupProps {
  title: string;
  players: OptiPlayer[];
  reasons: Map<number, SelectionReason>;
  className?: string;
}

/** A labelled group of player lines (e.g. all starting defenders). */
export function PositionGroup({
  title,
  players,
  reasons,
  className,
}: PositionGroupProps) {
  if (players.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {players.map((p) => (
          <PlayerLine key={p.id} player={p} reason={reasons.get(p.id)} />
        ))}
      </div>
    </div>
  );
}
