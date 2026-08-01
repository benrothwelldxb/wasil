import { Crown } from "lucide-react";
import { SectionCard } from "@/components/common";
import { PlayerAvatar } from "@/features/player-explorer";
import { cn } from "@/lib/utils";
import type { CaptainOption } from "../useScoutReport";

/**
 * A small "who should I captain?" strip: the top three picks by projected
 * points, each doubled (as the armband does), with a one-line reason. The
 * current captain is highlighted.
 */
export function CaptainCompare({ options }: { options: CaptainOption[] }) {
  if (options.length === 0) return null;

  return (
    <SectionCard title="Captain options" className="mt-4">
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li
            key={o.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-2.5",
              o.isCaptain ? "border-primary/40 bg-primary/5" : "bg-card",
            )}
          >
            <span className="w-4 text-sm font-semibold text-muted-foreground">
              {i + 1}
            </span>
            <PlayerAvatar photoUrl={o.photoUrl} name={o.name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{o.name}</span>
                {o.isCaptain && (
                  <Crown
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    aria-label="Current captain"
                  />
                )}
              </div>
              {o.reason && (
                <div className="truncate text-xs text-muted-foreground">
                  {o.reason}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-bold tabular-nums">
                {(o.points * 2).toFixed(1)}
              </div>
              <div className="text-[10px] text-muted-foreground">as (C)</div>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
