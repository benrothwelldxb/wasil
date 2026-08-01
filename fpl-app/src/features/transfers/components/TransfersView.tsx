import { Link } from "react-router-dom";
import { QueryBoundary } from "@/features/fpl";
import { WINDOWS, type PredictionWindow } from "@/features/predictions";
import { EmptyState } from "@/components/common";
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
import { MAX_FREE_TRANSFERS } from "../store";
import { useTransfers } from "../useTransfers";
import { TransferCard } from "./TransferCard";

const WINDOW_LABEL: Record<PredictionWindow, string> = {
  1: "This week",
  3: "Next 3",
  5: "Next 5",
  8: "Next 8",
};

export function TransfersView() {
  const t = useTransfers();

  if (!t.isLoading && !t.squadReady) {
    return (
      <EmptyState
        title="Save your squad first"
        description={`Build and save a full, legal 15-player squad to get transfer recommendations (you have ${t.squadSize}/15).`}
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

  return (
    <QueryBoundary
      isLoading={t.isLoading}
      isError={t.isError}
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
                onClick={() => t.setWindow(w)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                  w === t.window
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {WINDOW_LABEL[w]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Free transfers:</span>
            <Select
              value={String(t.freeTransfers)}
              onValueChange={(v) => t.setFreeTransfers(Number(v))}
            >
              <SelectTrigger aria-label="Free transfers" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_FREE_TRANSFERS }, (_, i) => i + 1).map(
                  (n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <Badge variant="secondary" className="ml-auto">
            Bank £{(t.bank / 10).toFixed(1)}m
          </Badge>
          {t.plans && (
            <Badge variant="outline">
              Current XI {t.plans.currentProjected.toFixed(1)}
            </Badge>
          )}
        </div>

        {/* Recommendations */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TransferCard
            title="Best single transfer"
            description={`One move${t.freeTransfers >= 1 ? " (free)" : ""} to lift your projected score.`}
            move={t.plans?.single ?? null}
          />
          <TransferCard
            title="Best double transfer"
            description={
              t.freeTransfers >= 2
                ? "Two moves, both free."
                : `Two moves (−4 hit for the ${2 - t.freeTransfers > 0 ? "2nd" : ""} transfer).`
            }
            move={t.plans?.double ?? null}
          />
        </div>

        <TransferCard
          title="Best wildcard squad"
          description="Unlimited free transfers — the ideal squad for your budget and horizon."
          move={t.plans?.wildcard ?? null}
          emptyLabel="No improvement available."
        />
      </div>
    </QueryBoundary>
  );
}
