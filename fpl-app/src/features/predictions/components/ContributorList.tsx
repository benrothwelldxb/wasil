import { cn } from "@/lib/utils";
import type { Contributor } from "../types";

interface ContributorListProps {
  contributors: Contributor[];
  /** Hide contributions smaller than this (absolute points). */
  threshold?: number;
  className?: string;
}

/**
 * The transparent, signed contribution breakdown. Every term that meaningfully
 * moves the total is shown with its exact points — nothing is hidden.
 */
export function ContributorList({
  contributors,
  threshold = 0.05,
  className,
}: ContributorListProps) {
  const shown = contributors.filter((c) => Math.abs(c.points) >= threshold);
  if (shown.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No meaningful contributions (player unlikely to feature).
      </p>
    );
  }

  const maxAbs = Math.max(...shown.map((c) => Math.abs(c.points)), 0.01);

  return (
    <ul className={cn("space-y-1.5", className)}>
      {shown.map((c) => {
        const positive = c.points >= 0;
        return (
          <li key={c.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <span
              className={cn(
                "w-14 text-right text-sm font-semibold tabular-nums",
                positive ? "text-success" : "text-destructive",
              )}
            >
              {positive ? "+" : ""}
              {c.points.toFixed(2)}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full",
                    positive ? "bg-success" : "bg-destructive",
                  )}
                  style={{ width: `${(Math.abs(c.points) / maxAbs) * 100}%` }}
                />
              </div>
              <span className="text-sm">{c.label}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
