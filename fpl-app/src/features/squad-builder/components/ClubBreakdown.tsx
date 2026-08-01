import { cn } from "@/lib/utils";
import { SQUAD_RULES } from "../rules";
import type { UseSquadResult } from "../useSquad";

interface ClubBreakdownProps {
  squad: UseSquadResult;
}

/**
 * Per-club counts, highlighting clubs at (or beyond) the three-player limit.
 */
export function ClubBreakdown({ squad }: ClubBreakdownProps) {
  const shortById = new Map(
    squad.players.map((p) => [p.teamId, p.teamShortName]),
  );

  const clubs = [...squad.clubCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  );

  if (clubs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No players selected yet. Max {SQUAD_RULES.maxPerClub} per club.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {clubs.map(([teamId, count]) => {
        const atLimit = count === SQUAD_RULES.maxPerClub;
        const over = count > SQUAD_RULES.maxPerClub;
        return (
          <span
            key={teamId}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              over && "border-destructive bg-destructive/10 text-destructive",
              atLimit &&
                !over &&
                "border-warning/50 bg-warning/10 text-warning",
              !atLimit && !over && "text-muted-foreground",
            )}
            title={
              over
                ? "Over the three-per-club limit"
                : atLimit
                  ? "At the three-per-club limit"
                  : undefined
            }
          >
            {shortById.get(teamId) ?? teamId}
            <span className="tabular-nums">{count}</span>
          </span>
        );
      })}
    </div>
  );
}
