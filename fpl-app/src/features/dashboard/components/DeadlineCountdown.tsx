import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useBootstrap } from "@/features/fpl";
import { cn } from "@/lib/utils";
import { formatCountdown } from "../deadline";

/**
 * A live "GW deadline in 1d 4h" pill for the dashboard — the single most-checked
 * fact in FPL. Ticks each minute; turns urgent inside the final six hours;
 * hides once the deadline passes or is unknown.
 */
export function DeadlineCountdown() {
  const bootstrap = useBootstrap();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const deadline = bootstrap.data?.nextDeadline;
  const eventId = bootstrap.data?.nextEventId;
  if (!deadline || eventId == null) return null;

  const remaining = new Date(deadline).getTime() - now;
  const label = formatCountdown(remaining);
  if (!label) return null;

  const urgent = remaining < 6 * 60 * 60_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        urgent
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      GW{eventId} deadline in {label}
    </span>
  );
}
