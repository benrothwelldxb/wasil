import { cn } from "@/lib/utils";
import { ratingTextClass } from "../colors";
import type { FixtureWindowRating } from "../types";

interface FixtureRatingBadgeProps {
  window: FixtureWindowRating;
  className?: string;
}

/** Numeric fixture ease rating (out of 100), coloured by value. */
export function FixtureRatingBadge({
  window,
  className,
}: FixtureRatingBadgeProps) {
  if (window.games === 0) {
    return <span className={cn("text-muted-foreground", className)}>–</span>;
  }
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        ratingTextClass(window.rating),
        className,
      )}
      title={`Avg difficulty ${window.averageDifficulty} over ${window.games} game${window.games === 1 ? "" : "s"}`}
    >
      {window.rating}
    </span>
  );
}
