import { useMemo } from "react";
import { useBootstrap } from "@/features/fpl";
import { SectionCard } from "@/components/common";
import { cn } from "@/lib/utils";
import { useGameweekCalendar } from "../useGameweekCalendar";
import {
  classifyGameweek,
  NOTABLE_BLANK,
  NOTABLE_DOUBLE,
  type GameweekKind,
  type GameweekOutlook,
} from "../calendar";

/** How many gameweeks ahead the planner shows. */
const HORIZON = 12;

const KIND_STYLE: Record<
  GameweekKind,
  { chip: string; label: string; tone: string }
> = {
  double: {
    chip: "border-emerald-500/40 bg-emerald-500/10",
    label: "Double",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  blank: {
    chip: "border-amber-500/40 bg-amber-500/10",
    label: "Blank",
    tone: "text-amber-600 dark:text-amber-400",
  },
  "minor-blank": {
    chip: "border-border bg-card",
    label: "Blank",
    tone: "text-muted-foreground",
  },
  normal: {
    chip: "border-border bg-card",
    label: "Normal",
    tone: "text-muted-foreground",
  },
};

function detailFor(g: GameweekOutlook, kind: GameweekKind): string {
  if (kind === "double") return `${g.doubleTeams} play twice`;
  if (g.blankTeams > 0) return `${g.blankTeams} blank`;
  return "All 20 play";
}

/** Pick the outlook with the highest score, ties broken by soonest gameweek. */
function biggest(
  items: GameweekOutlook[],
  score: (g: GameweekOutlook) => number,
): GameweekOutlook | null {
  let best: GameweekOutlook | null = null;
  for (const g of items) {
    if (!best || score(g) > score(best)) best = g;
  }
  return best;
}

/**
 * A forward-looking gameweek planner: a strip of upcoming gameweeks flagged as
 * blanks or doubles, plus chip-target call-outs. Team-independent — it's driven
 * entirely by the fixture calendar, so it's useful for planning chips ahead.
 */
export function GameweekPlanner() {
  const { calendar, isLoading } = useGameweekCalendar();
  const bootstrap = useBootstrap();

  const current =
    bootstrap.data?.nextEventId ?? bootstrap.data?.currentEventId ?? 0;

  const upcoming = useMemo(
    () =>
      calendar
        .filter((g) => g.event >= current)
        .slice(0, HORIZON),
    [calendar, current],
  );

  const callouts = useMemo(() => {
    const bigDouble = biggest(
      upcoming.filter((g) => g.doubleTeams >= NOTABLE_DOUBLE),
      (g) => g.doubleTeams,
    );
    const bigBlank = biggest(
      upcoming.filter((g) => g.blankTeams >= NOTABLE_BLANK),
      (g) => g.blankTeams,
    );
    const lines: { emoji: string; text: string }[] = [];
    if (bigDouble) {
      lines.push({
        emoji: "🎯",
        text: `GW${bigDouble.event}: ${bigDouble.doubleTeams} clubs play twice — a prime Triple Captain or Bench Boost week.`,
      });
    }
    if (bigBlank) {
      lines.push({
        emoji: "⚡",
        text: `GW${bigBlank.event}: ${bigBlank.blankTeams} clubs blank — line up a Free Hit (or Wildcard).`,
      });
    }
    return lines;
  }, [upcoming]);

  if (isLoading) {
    return (
      <SectionCard title="Chip planner">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-24 shrink-0 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (upcoming.length === 0) {
    return (
      <SectionCard title="Chip planner">
        <p className="text-sm text-muted-foreground">
          The gameweek calendar will appear here once the season's fixtures are
          published. Blank and double gameweeks are usually confirmed a few
          weeks ahead.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Chip planner"
      description="Blank and double gameweeks ahead — plan your chips around them."
    >
      {callouts.length > 0 && (
        <ul className="mb-4 space-y-2">
          {callouts.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span aria-hidden className="shrink-0 leading-tight">
                {c.emoji}
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {upcoming.map((g) => {
          const kind = classifyGameweek(g);
          const style = KIND_STYLE[kind];
          const isNotable = kind === "double" || kind === "blank";
          return (
            <div
              key={g.event}
              className={cn(
                "flex w-24 shrink-0 flex-col items-center rounded-lg border p-3 text-center",
                style.chip,
              )}
            >
              <div className="text-xs font-medium text-muted-foreground">
                GW{g.event}
              </div>
              <div
                className={cn(
                  "mt-1 text-sm font-bold",
                  isNotable ? style.tone : "text-foreground",
                )}
              >
                {style.label}
              </div>
              <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                {detailFor(g, kind)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Double —
          TC / BB
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Blank — Free
          Hit / WC
        </span>
      </div>
    </SectionCard>
  );
}
