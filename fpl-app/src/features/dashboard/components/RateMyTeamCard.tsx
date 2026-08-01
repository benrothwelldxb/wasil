import { Lightbulb } from "lucide-react";
import { SectionCard } from "@/components/common";
import { cn } from "@/lib/utils";
import type { CheckStatus, TeamRating } from "../rating";

const GRADE_COLOR: Record<TeamRating["grade"], string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-emerald-600 dark:text-emerald-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-destructive",
};

const DOT: Record<CheckStatus, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-500",
  weak: "bg-destructive",
};

/** A transparent "Rate My Team" grade with per-check reasons and a top fix. */
export function RateMyTeamCard({ rating }: { rating: TeamRating }) {
  return (
    <SectionCard title="Team rating" className="mt-4">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 text-3xl font-extrabold",
            GRADE_COLOR[rating.grade],
          )}
        >
          {rating.grade}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{rating.score}/100</div>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {rating.checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", DOT[c.status])}
                />
                <span className="font-medium">{c.label}</span>
                <span className="truncate text-muted-foreground">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {rating.topFix && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">Biggest win:</span> {rating.topFix}
          </span>
        </p>
      )}
    </SectionCard>
  );
}
