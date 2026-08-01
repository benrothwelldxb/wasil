import { AlertTriangle, CheckCircle2, CircleDashed, Trash2 } from "lucide-react";
import type { Position } from "@/features/fpl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clamp } from "@/utils";
import {
  POSITION_FALLBACK,
  POSITION_ORDER,
  POSITION_TARGETS,
  SQUAD_RULES,
} from "../rules";
import type { UseSquadResult } from "../useSquad";

interface SquadSummaryProps {
  squad: UseSquadResult;
  positions: Position[];
  onClear: () => void;
}

function StatusBadge({ squad }: { squad: UseSquadResult }) {
  if (!squad.isLegal) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Illegal squad
      </span>
    );
  }
  if (squad.isComplete) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        Valid squad
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
      <CircleDashed className="h-4 w-4" />
      {squad.size}/{SQUAD_RULES.totalPlayers} selected
    </span>
  );
}

/** Live budget, position counts, and overall validity of the squad. */
export function SquadSummary({ squad, positions, onClear }: SquadSummaryProps) {
  const overBudget = squad.remainingTenths < 0;
  const spentPct = clamp((squad.spent / squad.budget) * 100, 0, 100);

  const shortById = new Map(positions.map((p) => [p.id, p.shortName]));

  return (
    <div className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBadge squad={squad} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={squad.size === 0}
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Remaining budget
          </span>
          <span
            className={cn(
              "text-2xl font-bold tabular-nums",
              overBudget ? "text-destructive" : "text-foreground",
            )}
          >
            £{squad.remaining.toFixed(1)}m
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              overBudget ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${spentPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Spent £{squad.spent.toFixed(1)}m</span>
          <span>Budget £{squad.budget.toFixed(1)}m</span>
        </div>
      </div>

      {/* Position counters */}
      <div className="grid grid-cols-4 gap-2">
        {POSITION_ORDER.map((id) => {
          const count = squad.positionCounts.get(id) ?? 0;
          const target = POSITION_TARGETS[id] ?? 0;
          const short = shortById.get(id) ?? POSITION_FALLBACK[id]?.short ?? "?";
          const over = count > target;
          const exact = count === target;
          return (
            <div
              key={id}
              className={cn(
                "rounded-md border p-2 text-center",
                over && "border-destructive/40 bg-destructive/5",
                exact && "border-success/40 bg-success/5",
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">
                {short}
              </div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
                  over && "text-destructive",
                  exact && "text-success",
                )}
              >
                {count}
                <span className="text-sm font-normal text-muted-foreground">
                  /{target}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
