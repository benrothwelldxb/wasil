import { Crown } from "lucide-react";
import { SectionCard } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLiveScore, type PlayerLiveStatus } from "../useLiveScore";

const STATUS_DOT: Record<PlayerLiveStatus, string> = {
  playing: "bg-emerald-500",
  "to-play": "bg-muted-foreground/40",
  played: "bg-muted-foreground",
};

const STATUS_LABEL: Record<PlayerLiveStatus, string> = {
  playing: "Playing",
  "to-play": "To play",
  played: "Played",
};

/**
 * Live gameweek score for the connected team — total points (with provisional
 * bonus), a "LIVE" pulse while matches are on, and a per-player breakdown.
 * Renders nothing until the connected team's gameweek has kicked off.
 */
export function LiveScoreCard({ compact = false }: { compact?: boolean }) {
  const live = useLiveScore();
  if (!live.isLive) return null;

  const starters = [...live.starters].sort((a, b) => b.points - a.points);

  return (
    <SectionCard
      title={
        live.finished ? (
          <span className="text-sm font-semibold text-muted-foreground">
            GW{live.gameweek} result
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            LIVE · GW{live.gameweek}
          </span>
        )
      }
      className={compact ? undefined : "mb-4"}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-5xl font-bold tabular-nums">
            {Math.round(live.totalPoints)}
          </div>
          <div className="text-xs text-muted-foreground">
            live points{live.hasProvisional ? " · incl. provisional bonus" : ""}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {live.playing}
            </span>{" "}
            playing
          </div>
          <div>{live.toPlay} to play</div>
          <div>{live.played} played</div>
        </div>
      </div>

      {live.starters.some((r) => r.multiplier >= 3) && (
        <Badge variant="secondary" className="mt-3">
          Triple Captain active
        </Badge>
      )}

      {!compact && (
        <ul className="mt-4 space-y-1.5">
          {starters.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2.5 rounded-md px-1 py-1 text-sm"
            >
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[r.status])}
                title={STATUS_LABEL[r.status]}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate font-medium">{r.name}</span>
                {r.isCaptain && (
                  <Crown className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </span>
              {r.provisionalBonus > 0 && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  +{r.provisionalBonus} prov
                </span>
              )}
              <span className="w-8 text-right font-bold tabular-nums">
                {Math.round(r.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
