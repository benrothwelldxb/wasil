import { cn } from "@/lib/utils";

interface PositionBadgeProps {
  /** Short position code, e.g. "GKP", "DEF", "MID", "FWD". */
  shortName: string;
  className?: string;
}

/** Position-specific colours, echoing familiar FPL conventions. */
const POSITION_STYLES: Record<string, string> = {
  GKP: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DEF: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  MID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FWD: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/** A compact, colour-coded position pill. */
export function PositionBadge({ shortName, className }: PositionBadgeProps) {
  const style =
    POSITION_STYLES[shortName] ??
    "bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold",
        style,
        className,
      )}
    >
      {shortName}
    </span>
  );
}
