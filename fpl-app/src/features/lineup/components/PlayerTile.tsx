import { PlayerAvatar, PositionBadge, TeamBadge } from "@/features/player-explorer";
import { cn } from "@/lib/utils";
import type { LineupPlayer } from "../useLineup";

interface PlayerTileProps {
  lp: LineupPlayer;
  isStarter: boolean;
  isCaptain: boolean;
  isVice: boolean;
  selected: boolean;
  onSelect: (id: number) => void;
  onCaptain?: (id: number) => void;
  onVice?: (id: number) => void;
}

/** A selectable player tile with captain/vice controls. */
export function PlayerTile({
  lp,
  isStarter,
  isCaptain,
  isVice,
  selected,
  onSelect,
  onCaptain,
  onVice,
}: PlayerTileProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-card p-2.5 transition-colors",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(lp.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        aria-label={`Select ${lp.player.webName} to swap`}
      >
        <PlayerAvatar
          photoUrl={lp.player.photoUrl}
          name={lp.player.webName}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {lp.player.webName}
            </span>
            {isCaptain && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                C
              </span>
            )}
            {isVice && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                V
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TeamBadge
              teamCode={lp.player.teamCode}
              teamShortName={lp.player.teamShortName}
              size={12}
            />
            <PositionBadge shortName={lp.player.positionShortName} />
          </div>
        </div>
        <span className="shrink-0 text-right text-sm font-bold tabular-nums">
          {lp.value.toFixed(1)}
        </span>
      </button>

      {isStarter && (onCaptain || onVice) && (
        <div className="flex shrink-0 flex-col gap-1">
          {onCaptain && (
            <button
              type="button"
              onClick={() => onCaptain(lp.id)}
              disabled={isCaptain}
              className={cn(
                "h-6 w-6 rounded text-xs font-bold transition-colors",
                isCaptain
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-accent",
              )}
              title="Set captain"
            >
              C
            </button>
          )}
          {onVice && (
            <button
              type="button"
              onClick={() => onVice(lp.id)}
              disabled={isVice || isCaptain}
              className={cn(
                "h-6 w-6 rounded text-xs font-bold transition-colors",
                isVice
                  ? "bg-secondary text-secondary-foreground"
                  : "border hover:bg-accent disabled:opacity-40",
              )}
              title="Set vice-captain"
            >
              V
            </button>
          )}
        </div>
      )}
    </div>
  );
}
