import { ArrowRight, MinusCircle, PlusCircle, TrendingUp } from "lucide-react";
import { PlayerAvatar, TeamBadge } from "@/features/player-explorer";
import { SectionCard } from "@/components/common";
import { cn } from "@/lib/utils";
import type { TransferMove, TransferPlayer } from "../types";

function PlayerRow({
  player,
  tone,
}: {
  player: TransferPlayer;
  tone: "out" | "in";
}) {
  return (
    <div className="flex items-center gap-2">
      {tone === "out" ? (
        <MinusCircle className="h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <PlusCircle className="h-4 w-4 shrink-0 text-success" />
      )}
      <PlayerAvatar
        photoUrl={player.player.photoUrl}
        name={player.player.webName}
        size={24}
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {player.player.webName}
      </span>
      <TeamBadge
        teamCode={player.player.teamCode}
        teamShortName={player.player.teamShortName}
        size={12}
      />
      <span className="w-10 text-right text-sm font-semibold tabular-nums">
        {player.value.toFixed(1)}
      </span>
      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
        £{(player.cost / 10).toFixed(1)}
      </span>
    </div>
  );
}

interface TransferCardProps {
  title: string;
  description: string;
  move: TransferMove | null;
  /** Message when no move is worthwhile. */
  emptyLabel?: string;
}

/** One recommendation: out/in, money remaining, projected gain, reasoning. */
export function TransferCard({
  title,
  description,
  move,
  emptyLabel = "Hold — no beneficial move found.",
}: TransferCardProps) {
  return (
    <SectionCard title={title} description={description}>
      {!move || move.out.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-4">
          {/* Out / In */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Out
              </div>
              {move.out.map((p) => (
                <PlayerRow key={p.id} player={p} tone="out" />
              ))}
            </div>
            <ArrowRight className="hidden h-5 w-5 text-muted-foreground sm:block" />
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                In
              </div>
              {move.in.map((p) => (
                <PlayerRow key={p.id} player={p} tone="in" />
              ))}
            </div>
          </div>

          {/* Numbers */}
          <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Proj. gain</div>
              <div className="flex items-center justify-center gap-1 font-bold text-success">
                <TrendingUp className="h-4 w-4" />+{move.gain.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {move.hit > 0 ? `Net (−${move.hit} hit)` : "Net gain"}
              </div>
              <div
                className={cn(
                  "font-bold tabular-nums",
                  move.net >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {move.net >= 0 ? "+" : ""}
                {move.net.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Money left</div>
              <div className="font-bold tabular-nums">
                £{(move.moneyRemaining / 10).toFixed(1)}m
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {move.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
