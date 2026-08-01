import { cn } from "@/lib/utils";
import { difficultyClasses } from "../colors";
import type { UpcomingFixture } from "../types";

interface DifficultyPillProps {
  fixture: UpcomingFixture;
  className?: string;
}

/**
 * A single fixture chip: opponent short name + venue, coloured by difficulty.
 * e.g. `ARS (H)` on a green background for an easy home game.
 */
export function DifficultyPill({ fixture, className }: DifficultyPillProps) {
  const title = `${fixture.opponentName} (${fixture.isHome ? "Home" : "Away"}) — difficulty ${fixture.difficulty}${
    fixture.event !== null ? `, GW${fixture.event}` : ""
  }`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded px-1.5 py-1 text-xs font-semibold",
        difficultyClasses(fixture.difficulty),
        className,
      )}
    >
      <span>{fixture.opponentShort}</span>
      <span className="opacity-70">{fixture.isHome ? "H" : "A"}</span>
    </span>
  );
}
