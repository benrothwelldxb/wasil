import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { QueryBoundary } from "@/features/fpl";
import { WINDOWS, type PredictionWindow } from "@/features/predictions";
import { EmptyState, SectionCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/paths";
import { useLineup, type LineupPlayer } from "../useLineup";
import { PlayerTile } from "./PlayerTile";

const WINDOW_LABEL: Record<PredictionWindow, string> = {
  1: "This week",
  3: "Next 3",
  5: "Next 5",
  8: "Next 8",
};

const POSITION_TITLE: Record<number, string> = {
  1: "Goalkeeper",
  2: "Defenders",
  3: "Midfielders",
  4: "Forwards",
};

export function LineupView() {
  const lu = useLineup();
  const [selected, setSelected] = useState<number | null>(null);

  const isStarter = (id: number) => lu.lineup.starterIds.includes(id);

  const handleSelect = (id: number) => {
    if (selected === null || selected === id) {
      setSelected(selected === id ? null : id);
      return;
    }
    const aStart = isStarter(selected);
    const bStart = isStarter(id);
    if (aStart && !bStart) {
      lu.substitute(selected, id);
      setSelected(null);
    } else if (!aStart && bStart) {
      lu.substitute(id, selected);
      setSelected(null);
    } else {
      setSelected(id); // both same side — just move the selection
    }
  };

  if (!lu.isLoading && !lu.squadReady) {
    return (
      <EmptyState
        title="No complete squad yet"
        description={`Pick a full, legal 15-player squad first (you have ${lu.squadSize}/15).`}
        action={
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link to={ROUTES.squad}>Build a squad</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={ROUTES.optimiser}>Auto-optimise one</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const starterOf = (pos: number): LineupPlayer[] =>
    lu.lineup.starterIds
      .map((id) => lu.playersById.get(id))
      .filter((p): p is LineupPlayer => p?.positionId === pos)
      .sort((a, b) => b.value - a.value);

  const benchGk = lu.lineup.benchGkId
    ? lu.playersById.get(lu.lineup.benchGkId)
    : undefined;
  const benchOutfield = lu.lineup.benchOutfieldIds
    .map((id) => lu.playersById.get(id))
    .filter((p): p is LineupPlayer => p !== undefined);

  const captain = lu.lineup.captainId
    ? lu.playersById.get(lu.lineup.captainId)
    : undefined;
  const vice = lu.lineup.viceId
    ? lu.playersById.get(lu.lineup.viceId)
    : undefined;

  const tileProps = (lp: LineupPlayer) => ({
    lp,
    isStarter: isStarter(lp.id),
    isCaptain: lp.id === lu.lineup.captainId,
    isVice: lp.id === lu.lineup.viceId,
    selected: selected === lp.id,
    onSelect: handleSelect,
  });

  return (
    <QueryBoundary
      isLoading={lu.isLoading}
      isError={lu.isError}
      error={null}
      onRetry={() => {}}
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Plan for:</span>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => lu.setWindow(w)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                  w === lu.window
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {WINDOW_LABEL[w]}
              </button>
            ))}
          </div>
          {lu.isEdited && (
            <Badge variant="secondary">Manually edited</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={lu.reset}
            disabled={!lu.isEdited}
            className="ml-auto"
          >
            <RotateCcw className="h-4 w-4" />
            Auto-pick
          </Button>
        </div>

        {/* Projected score */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">
              Projected score · {WINDOW_LABEL[lu.window].toLowerCase()}
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {lu.projection.total.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">
              XI {lu.projection.base.toFixed(1)} + captain{" "}
              {lu.projection.captainBonus.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Formation</div>
            <div className="text-2xl font-bold tabular-nums">
              {lu.projection.formation.def}-{lu.projection.formation.mid}-
              {lu.projection.formation.fwd}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Captaincy</div>
            <div className="text-sm">
              <span className="font-semibold">C</span>{" "}
              {captain?.player.webName ?? "—"}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold">V</span>{" "}
              {vice?.player.webName ?? "—"}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Tap a starter then a bench player to swap them. Use the C / V buttons
          to set captain and vice — the projected score updates instantly.
        </p>

        {/* Starting XI + bench */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <SectionCard title="Starting XI">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((pos) => {
                const players = starterOf(pos);
                if (players.length === 0) return null;
                return (
                  <div key={pos} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {POSITION_TITLE[pos]}
                    </h4>
                    <div className="space-y-2">
                      {players.map((lp) => (
                        <PlayerTile
                          key={lp.id}
                          {...tileProps(lp)}
                          onCaptain={lu.setCaptain}
                          onVice={lu.setVice}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SectionCard
              title="Bench"
              description="Substitution order — first outfield sub comes on first."
            >
              <div className="space-y-2">
                {benchGk && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Sub keeper
                    </div>
                    <PlayerTile {...tileProps(benchGk)} />
                  </div>
                )}
                {benchOutfield.map((lp, i) => (
                  <div key={lp.id} className="flex items-center gap-2">
                    <span className="w-5 text-center text-xs font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <PlayerTile {...tileProps(lp)} />
                    </div>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => lu.moveBench(lp.id, -1)}
                        disabled={i === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => lu.moveBench(lp.id, 1)}
                        disabled={i === benchOutfield.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </aside>
        </div>
      </div>
    </QueryBoundary>
  );
}
