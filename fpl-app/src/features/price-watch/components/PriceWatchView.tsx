import { TrendingDown, TrendingUp } from "lucide-react";
import { QueryBoundary } from "@/features/fpl";
import { PlayerAvatar } from "@/features/player-explorer";
import { SectionCard } from "@/components/common";
import { cn } from "@/lib/utils";
import { usePriceWatch } from "../usePriceWatch";
import type { PriceLikelihood, PricePrediction } from "../predict";

function fmtNet(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : "−";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

const LIKELIHOOD_LABEL: Record<PriceLikelihood, string> = {
  high: "Likely",
  medium: "Possible",
  low: "Watch",
};

function Row({ p, rising }: { p: PricePrediction; rising: boolean }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <PlayerAvatar
        photoUrl={p.player.photoUrl}
        name={p.player.webName}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.player.webName}</div>
        <div className="text-xs text-muted-foreground">
          {p.player.teamShortName} · £{p.player.price.now.toFixed(1)}m
        </div>
      </div>
      <div className="text-right">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            rising
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive",
          )}
        >
          {fmtNet(p.netTransfers)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {LIKELIHOOD_LABEL[p.likelihood]}
        </div>
      </div>
    </li>
  );
}

/**
 * Price Watch — likely risers and fallers tonight, ranked by net-transfer
 * momentum. Transparent about being an estimate, not a guaranteed change.
 */
export function PriceWatchView() {
  const { watch, isLoading, isError, error, refetch } = usePriceWatch();

  return (
    <QueryBoundary
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
    >
      <p className="mb-4 text-xs text-muted-foreground">
        Ranked by net transfers this gameweek. FPL's exact price threshold is
        secret, so treat this as transfer momentum — a strong signal, not a
        guarantee.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard
          title={
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" /> Rising
            </span>
          }
        >
          {watch.risers.length > 0 ? (
            <ul className="divide-y">
              {watch.risers.map((p) => (
                <Row key={p.player.id} p={p} rising />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No strong risers right now.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2 text-destructive">
              <TrendingDown className="h-4 w-4" /> Falling
            </span>
          }
        >
          {watch.fallers.length > 0 ? (
            <ul className="divide-y">
              {watch.fallers.map((p) => (
                <Row key={p.player.id} p={p} rising={false} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No strong fallers right now.
            </p>
          )}
        </SectionCard>
      </div>
    </QueryBoundary>
  );
}
