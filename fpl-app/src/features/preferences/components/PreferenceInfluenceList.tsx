import {
  Ban,
  Crown,
  Gauge,
  Shield,
  Swords,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdjustmentSource, ScoreAdjustment } from "../PreferenceService";

const SOURCE_ICON: Record<AdjustmentSource, LucideIcon> = {
  "club-affinity": Crown,
  "club-avoid": Ban,
  risk: Gauge,
  ownership: Users,
  fixtures: TrendingUp,
  "playing-style": Swords,
  rotation: Shield,
};

interface PreferenceInfluenceListProps {
  adjustments: ScoreAdjustment[];
  /** Shown when preferences had no effect (e.g. Pure Data profile). */
  emptyLabel?: string;
  className?: string;
}

/**
 * Renders the "why" behind personalised scores. Every recommendation surface
 * (optimiser, captain picks, transfer plans, AI explanations) can drop this in
 * to satisfy the transparency requirement — it consumes the `ScoreAdjustment[]`
 * returned by {@link PreferenceService.adjustPlayerScore}.
 */
export function PreferenceInfluenceList({
  adjustments,
  emptyLabel = "No preference influence — pure data.",
  className,
}: PreferenceInfluenceListProps) {
  if (adjustments.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {adjustments.map((adj, i) => {
        const Icon = SOURCE_ICON[adj.source];
        const positive = adj.deltaPercent > 0;
        return (
          <li key={i} className="flex items-start gap-2 text-xs">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{adj.explanation}</span>
            <span
              className={cn(
                "ml-auto shrink-0 font-medium tabular-nums",
                positive ? "text-success" : "text-destructive",
              )}
            >
              {positive ? "+" : ""}
              {adj.deltaPercent.toFixed(1)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
