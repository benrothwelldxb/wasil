import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { QueryBoundary } from "@/features/fpl";
import { WINDOWS, type PredictionWindow } from "@/features/predictions";
import { useSquadStore } from "@/features/squad-builder";
import { EmptyState, SectionCard } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/paths";
import { FORMATIONS } from "../config";
import { useOptimiser } from "../useOptimiser";
import type { Formation, OptiPlayer } from "../types";
import { PositionGroup } from "./PlayerLine";

const WINDOW_LABEL: Record<PredictionWindow, string> = {
  1: "This week",
  3: "Next 3",
  5: "Next 5",
  8: "Next 8",
};

const AUTO = "auto";
const fmtFormation = (f: Formation) => `${f.def}-${f.mid}-${f.fwd}`;

function byPos(players: OptiPlayer[], id: number): OptiPlayer[] {
  return players.filter((p) => p.positionId === id);
}

export function OptimiserView() {
  const opt = useOptimiser();
  const { result } = opt;
  const navigate = useNavigate();
  const setPlayers = useSquadStore((s) => s.setPlayers);
  const currentSquadSize = useSquadStore((s) => s.playerIds.length);

  const useThisTeam = () => {
    if (!result) return;
    if (
      currentSquadSize > 0 &&
      !window.confirm("Replace your saved squad with this team?")
    ) {
      return;
    }
    setPlayers(result.squad.map((p) => p.id));
    navigate(ROUTES.lineup);
  };

  return (
    <QueryBoundary
      isLoading={opt.isLoading}
      isError={opt.isError}
      error={opt.error}
      onRetry={opt.refetch}
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">
                Plan for:
              </span>
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => opt.setWindow(w)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                    w === opt.window
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {WINDOW_LABEL[w]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Formation:</span>
              <Select
                value={opt.formation ? fmtFormation(opt.formation) : AUTO}
                onValueChange={(v) =>
                  opt.setFormation(
                    v === AUTO
                      ? null
                      : (FORMATIONS.find((f) => fmtFormation(f) === v) ?? null),
                  )
                }
              >
                <SelectTrigger aria-label="Formation" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Auto (best)</SelectItem>
                  {FORMATIONS.map((f) => (
                    <SelectItem key={fmtFormation(f)} value={fmtFormation(f)}>
                      {fmtFormation(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="secondary" className="ml-auto">
              Budget £{(opt.budget / 10).toFixed(1)}m
            </Badge>
          </div>
        </div>

        {opt.avoidRelaxed && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              We couldn't build a legal squad while avoiding every club you
              picked, so your avoid list was relaxed for this team. Try avoiding
              fewer clubs in Preferences.
            </span>
          </div>
        )}

        {!result ? (
          <EmptyState
            icon={Wand2}
            title="No squad produced"
            description="Not enough player data to optimise yet."
          />
        ) : (
          <>
            {/* Summary */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-card p-4 sm:col-span-1">
                <div className="text-xs text-muted-foreground">
                  Projected points
                </div>
                <div className="text-3xl font-bold tabular-nums">
                  {result.totalProjected.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground">
                  starting XI · {WINDOW_LABEL[opt.window].toLowerCase()}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Formation</div>
                <div className="text-2xl font-bold tabular-nums">
                  {fmtFormation(result.best.formation)}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs text-muted-foreground">Cost</div>
                <div className="text-2xl font-bold tabular-nums">
                  £{(result.cost / 10).toFixed(1)}m
                </div>
                <div className="text-xs text-muted-foreground">
                  £{(result.remaining / 10).toFixed(1)}m left
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  {result.valid && (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  )}
                  <span className="text-sm font-semibold">
                    {result.valid ? "Legal squad" : "Invalid"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {result.elapsedMs}ms
                </div>
              </div>
            </div>

            {/* Primary action: adopt this team */}
            <Button size="lg" className="w-full sm:w-auto" onClick={useThisTeam}>
              Use this team
              <ArrowRight className="h-4 w-4" />
            </Button>

            {/* Starting XI + bench */}
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <SectionCard
                title="Starting XI"
                description="The highest-scoring legal eleven. Every pick is explained."
              >
                <div className="space-y-4">
                  <PositionGroup
                    title="Goalkeeper"
                    players={byPos(result.best.starters, 1)}
                    reasons={result.reasons}
                  />
                  <PositionGroup
                    title="Defenders"
                    players={byPos(result.best.starters, 2)}
                    reasons={result.reasons}
                  />
                  <PositionGroup
                    title="Midfielders"
                    players={byPos(result.best.starters, 3)}
                    reasons={result.reasons}
                  />
                  <PositionGroup
                    title="Forwards"
                    players={byPos(result.best.starters, 4)}
                    reasons={result.reasons}
                  />
                </div>
              </SectionCard>

              <aside className="lg:sticky lg:top-20 lg:self-start">
                <SectionCard
                  title="Bench"
                  description="Cheap fodder that frees budget for the XI."
                >
                  <PositionGroup
                    title="Substitutes"
                    players={[...result.best.bench].sort(
                      (a, b) => a.positionId - b.positionId,
                    )}
                    reasons={result.reasons}
                  />
                </SectionCard>
              </aside>
            </div>
          </>
        )}
      </div>
    </QueryBoundary>
  );
}
