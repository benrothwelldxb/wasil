import { cn } from "@/lib/utils";
import type { TeamFixtureAnalysis } from "../types";
import { DifficultyPill } from "./DifficultyPill";

interface FixtureRunProps {
  analysis: TeamFixtureAnalysis | undefined;
  /** How many upcoming fixtures to show. */
  count?: number;
  className?: string;
}

/**
 * A coloured run of a team's upcoming fixtures — the FDR "ticker". Enhances a
 * player row/card so their upcoming schedule is visible at a glance.
 */
export function FixtureRun({
  analysis,
  count = 5,
  className,
}: FixtureRunProps) {
  const fixtures = analysis?.fixtures.slice(0, count) ?? [];

  if (fixtures.length === 0) {
    return <span className="text-xs text-muted-foreground">No fixtures</span>;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {fixtures.map((fixture) => (
        <DifficultyPill key={fixture.fixtureId} fixture={fixture} />
      ))}
    </div>
  );
}
