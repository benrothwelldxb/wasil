import { PlayerAvatar, PositionBadge, TeamBadge } from "@/features/player-explorer";
import { ratingBgClass } from "@/features/fixtures";
import { PreferenceInfluenceList } from "@/features/preferences";
import { cn } from "@/lib/utils";
import type { PlayerScore, ScoreComponent } from "../types";
import { RatingBadge } from "./RatingBadge";

function MetricRow({ component }: { component: ScoreComponent }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{component.label}</span>
        <span className="text-xs text-muted-foreground">
          weight {Math.round(component.weight * 100)}%
        </span>
      </div>
      <span className="text-right text-sm font-semibold tabular-nums">
        +{component.contribution.toFixed(1)}
      </span>
      <div className="col-span-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full", ratingBgClass(component.score))}
            style={{ width: `${Math.round(component.value * 100)}%` }}
          />
        </div>
        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(component.score)}
        </span>
      </div>
    </div>
  );
}

interface ScoreBreakdownProps {
  score: PlayerScore;
}

/** The complete, transparent score breakdown for one player. */
export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const { player } = score;
  const delta = score.totalDeltaPercent;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PlayerAvatar photoUrl={player.photoUrl} name={player.webName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold">
              {player.webName}
            </span>
            <PositionBadge shortName={player.positionShortName} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <TeamBadge
              teamCode={player.teamCode}
              teamShortName={player.teamShortName}
              size={16}
            />
            {player.teamName}
          </div>
        </div>
        <div className="text-right">
          <RatingBadge rating={score.overallRating} size="lg" />
          <div className="mt-1 text-xs text-muted-foreground">
            Rank #{score.rank}
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Overall</div>
          <div className="text-xl font-bold tabular-nums">
            {score.overallRating.toFixed(1)}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Expected pts</div>
          <div className="text-xl font-bold tabular-nums">
            {score.expectedPoints.toFixed(1)}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xs text-muted-foreground">Price</div>
          <div className="text-xl font-bold tabular-nums">
            £{player.price.now.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Weighted metric breakdown */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Weighted metrics</h4>
          <span className="text-xs text-muted-foreground">
            base {score.baseRating.toFixed(1)}
          </span>
        </div>
        <div className="divide-y">
          {score.components.map((c) => (
            <MetricRow key={c.key} component={c} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold">
          <span>Base rating</span>
          <span className="tabular-nums">{score.baseRating.toFixed(1)}</span>
        </div>
      </div>

      {/* Preference personalisation */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Preference influence</h4>
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              delta > 0
                ? "text-success"
                : delta < 0
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            base {score.baseRating.toFixed(1)} → {score.overallRating.toFixed(1)}{" "}
            ({delta > 0 ? "+" : ""}
            {delta.toFixed(1)}%)
          </span>
        </div>
        <PreferenceInfluenceList
          adjustments={score.adjustments}
          emptyLabel="No preference influence — this is the pure data rating."
        />
      </div>
    </div>
  );
}
