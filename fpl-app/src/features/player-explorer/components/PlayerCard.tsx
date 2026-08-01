import type { ReactNode } from "react";
import type { Player } from "@/features/fpl";
import { FixtureRun, type TeamFixtureAnalysis } from "@/features/fixtures";
import { PlayerAvatar } from "./PlayerAvatar";
import { PositionBadge } from "./PositionBadge";
import { SetPieceBadge } from "./SetPieceBadge";
import { TeamBadge } from "./TeamBadge";
import { WatchlistStar } from "./WatchlistStar";

interface PlayerCardProps {
  player: Player;
  /** Optional action control (e.g. add/remove) rendered top-right. */
  action?: ReactNode;
  /** Optional fixture analysis for this player's club. */
  fixtureAnalysis?: TeamFixtureAnalysis;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** A single player rendered as a card (mobile / narrow layouts). */
export function PlayerCard({
  player,
  action,
  fixtureAnalysis,
}: PlayerCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <PlayerAvatar photoUrl={player.photoUrl} name={player.webName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{player.webName}</span>
            <PositionBadge shortName={player.positionShortName} />
            <SetPieceBadge player={player} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <TeamBadge
              teamCode={player.teamCode}
              teamShortName={player.teamShortName}
              size={16}
            />
            <span>{player.teamName}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums">
            £{player.price.now.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground">
            {player.selectedByPercent.toFixed(1)}% owned
          </div>
        </div>
        <WatchlistStar playerId={player.id} />
        {action && <div className="ml-1 shrink-0">{action}</div>}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 border-t pt-3">
        <Stat label="Pts" value={player.totalPoints} />
        <Stat label="Form" value={player.form.toFixed(1)} />
        <Stat label="Mins" value={player.minutes.toLocaleString()} />
        <Stat label="Goals" value={player.goalsScored} />
        <Stat label="Assists" value={player.assists} />
        <Stat label="Clean sheets" value={player.cleanSheets} />
      </div>

      {fixtureAnalysis && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            Next fixtures
          </div>
          <FixtureRun analysis={fixtureAnalysis} count={5} />
        </div>
      )}
    </div>
  );
}
