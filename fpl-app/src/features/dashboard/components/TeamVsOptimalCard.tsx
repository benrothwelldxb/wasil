import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Scale } from "lucide-react";
import { usePredictions } from "@/features/predictions";
import { useSquad } from "@/features/squad-builder";
import { useOptimiser } from "@/features/optimiser";
import { autoPickLineup, projectLineup } from "@/features/lineup";
import { PlayerAvatar } from "@/features/player-explorer";
import { SectionCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/paths";

/**
 * "Your team vs the optimal" — the hook for a manager who's connected/built a
 * team: how their best XI's projected points stack up against the highest-
 * scoring legal squad, and which players they're missing. Runs the optimiser
 * only on demand (a tap), so the dashboard never pays for it unprompted.
 */
export function TeamVsOptimalCard() {
  const squad = useSquad();
  const { byId } = usePredictions();
  const [compare, setCompare] = useState(false);
  const optimiser = useOptimiser({ enabled: compare });

  const complete = squad.isComplete && squad.players.length === 15;
  const w = optimiser.window;

  const yourPoints = useMemo(() => {
    if (!complete) return 0;
    const val = (id: number) => byId.get(id)?.windows[w].expectedPoints ?? 0;
    const lite = squad.players.map((p) => ({
      id: p.id,
      positionId: p.positionId,
      value: val(p.id),
    }));
    const lineup = autoPickLineup(lite);
    const liteById = new Map(lite.map((l) => [l.id, l]));
    return projectLineup(lineup, liteById).base;
  }, [complete, squad.players, byId, w]);

  const ownedIds = useMemo(
    () => new Set(squad.players.map((p) => p.id)),
    [squad.players],
  );

  if (!complete) return null;

  const optimal = optimiser.result;
  const gap = optimal ? optimal.totalProjected - yourPoints : null;
  const upgrades = optimal
    ? optimal.squad
        .filter((p) => !ownedIds.has(p.id))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    : [];

  return (
    <SectionCard title="Your team vs the optimal" className="mt-4">
      {!compare ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            See how your best XI stacks up against the highest-scoring legal
            squad — and which players you're missing.
          </p>
          <Button onClick={() => setCompare(true)} className="shrink-0">
            <Scale className="h-4 w-4" />
            Compare
          </Button>
        </div>
      ) : !optimal ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Crunching the optimal
          squad…
        </div>
      ) : (
        <>
          <div className="flex items-stretch gap-3">
            <div className="flex-1 rounded-lg border bg-card p-3 text-center">
              <div className="text-xs text-muted-foreground">Your XI</div>
              <div className="text-3xl font-bold tabular-nums">
                {yourPoints.toFixed(1)}
              </div>
            </div>
            <div className="flex items-center text-xs font-semibold text-muted-foreground">
              vs
            </div>
            <div className="flex-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-center">
              <div className="text-xs text-muted-foreground">Optimal XI</div>
              <div className="text-3xl font-bold tabular-nums">
                {optimal.totalProjected.toFixed(1)}
              </div>
            </div>
          </div>

          <p
            className={cn(
              "mt-3 text-sm",
              gap && gap > 0.5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {gap !== null && gap > 0.5
              ? `The optimal squad projects +${gap.toFixed(1)} pts more than yours.`
              : "Your team is right on the optimal — nicely built."}
          </p>

          {upgrades.length > 0 && (
            <>
              <div className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Players you're missing
              </div>
              <ul className="space-y-1.5">
                {upgrades.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <PlayerAvatar
                      photoUrl={p.player.photoUrl}
                      name={p.player.webName}
                      size={26}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {p.player.webName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      £{p.player.price.now.toFixed(1)}m
                    </span>
                    <span className="w-10 text-right font-semibold tabular-nums">
                      {p.value.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-3 w-full"
              >
                <Link to={ROUTES.transfers}>
                  Plan the swaps
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}
