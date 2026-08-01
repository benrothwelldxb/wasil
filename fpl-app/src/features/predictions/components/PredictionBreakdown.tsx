import { PlayerAvatar, PositionBadge, TeamBadge } from "@/features/player-explorer";
import { difficultyClasses } from "@/features/fixtures";
import { cn } from "@/lib/utils";
import { WINDOWS, type PredictionWindow } from "../config";
import type { FixturePrediction, PlayerPrediction } from "../types";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { ContributorList } from "./ContributorList";

const WINDOW_LABEL: Record<PredictionWindow, string> = {
  1: "GW",
  3: "3 GW",
  5: "5 GW",
  8: "8 GW",
};

function Impact({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 0.05) return null;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        positive
          ? "bg-success/10 text-success"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {label} {positive ? "+" : ""}
      {value.toFixed(2)}
    </span>
  );
}

function FixtureRow({ fixture }: { fixture: FixturePrediction }) {
  return (
    <li className="rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex min-w-[3.5rem] items-center justify-center rounded px-1.5 py-1 text-xs font-semibold",
              difficultyClasses(fixture.difficulty),
            )}
          >
            {fixture.opponentShort} {fixture.isHome ? "H" : "A"}
          </span>
          <span className="text-xs text-muted-foreground">
            {fixture.event !== null ? `GW${fixture.event}` : "TBC"}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {fixture.expectedPoints.toFixed(2)} pts
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          CS {Math.round(fixture.factors.cleanSheetProb * 100)}%
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          att ×{fixture.factors.attackEnv.toFixed(2)}
        </span>
        <Impact label="Home" value={fixture.factors.homeImpact} />
        <Impact label="Opp" value={fixture.factors.opponentImpact} />
        <Impact label="Rotation" value={fixture.factors.rotationImpact} />
      </div>
    </li>
  );
}

interface PredictionBreakdownProps {
  prediction: PlayerPrediction;
  window: PredictionWindow;
  onWindowChange: (window: PredictionWindow) => void;
}

/** The full, transparent xPts breakdown for one player. */
export function PredictionBreakdown({
  prediction,
  window,
  onWindowChange,
}: PredictionBreakdownProps) {
  const { player } = prediction;
  const active = prediction.windows[window];

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
      </div>

      {/* Window tiles */}
      <div className="grid grid-cols-4 gap-2">
        {WINDOWS.map((w) => {
          const win = prediction.windows[w];
          const selected = w === window;
          return (
            <button
              key={w}
              type="button"
              onClick={() => onWindowChange(w)}
              className={cn(
                "rounded-lg border p-2 text-center transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-accent/40",
              )}
            >
              <div className="text-[11px] text-muted-foreground">
                {WINDOW_LABEL[w]}
              </div>
              <div className="text-lg font-bold tabular-nums">
                {win.expectedPoints.toFixed(1)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {win.confidence}%
              </div>
            </button>
          );
        })}
      </div>

      {/* Headline for the selected window */}
      <div className="rounded-lg border p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-muted-foreground">
              Expected points · next {window === 1 ? "GW" : `${window} GWs`}
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {active.expectedPoints.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              {active.fixtureCount} fixture
              {active.fixtureCount === 1 ? "" : "s"}
              {active.gameweeks.length > 0 &&
                ` · GW ${active.gameweeks.join(", ")}`}
            </div>
          </div>
          <ConfidenceMeter confidence={active.confidence} className="w-32" />
        </div>
        <div className="mt-4 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold">Contributors</h4>
          <ContributorList contributors={active.contributors} />
        </div>
      </div>

      {/* Per-fixture detail */}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Upcoming fixtures</h4>
        {prediction.fixtures.length === 0 ? (
          <p className="text-xs text-muted-foreground">No upcoming fixtures.</p>
        ) : (
          <ul className="space-y-1.5">
            {prediction.fixtures.slice(0, 8).map((f) => (
              <FixtureRow key={f.fixtureId} fixture={f} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
