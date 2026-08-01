import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { QueryBoundary, useTeams, type Team } from "@/features/fpl";
import { cn } from "@/lib/utils";
import { TeamCrest } from "./TeamCrest";
import { useFixtureAnalysis } from "../useFixtureAnalysis";
import type { FixtureAnalysisMap, TeamFixtureAnalysis } from "../types";
import { FixtureRatingBadge } from "./FixtureRatingBadge";
import { FixtureRun } from "./FixtureRun";

type SortKey = "team" | "next1" | "next3" | "next5";
type SortDir = "asc" | "desc";

interface Row {
  team: Team;
  analysis: TeamFixtureAnalysis | undefined;
}

function ratingOf(
  analysis: TeamFixtureAnalysis | undefined,
  key: Exclude<SortKey, "team">,
): number {
  if (!analysis) return -1;
  return analysis[key].games === 0 ? -1 : analysis[key].rating;
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground",
        align === "right" ? "justify-end" : "justify-start",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

function FixturesTable({
  teams,
  analysis,
}: {
  teams: Team[];
  analysis: FixtureAnalysisMap;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("next5");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "team" ? "asc" : "desc");
    }
  };

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = teams.map((team) => ({
      team,
      analysis: analysis.get(team.id),
    }));
    const factor = sortDir === "asc" ? 1 : -1;
    return base.sort((a, b) => {
      let cmp: number;
      if (sortKey === "team") {
        cmp = a.team.name.localeCompare(b.team.name);
      } else {
        cmp = ratingOf(a.analysis, sortKey) - ratingOf(b.analysis, sortKey);
      }
      return cmp !== 0 ? cmp * factor : a.team.name.localeCompare(b.team.name);
    });
  }, [teams, analysis, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2.5 text-left">
              <SortHeader
                label="Team"
                sortKey="team"
                active={sortKey === "team"}
                dir={sortDir}
                onSort={onSort}
              />
            </th>
            <th className="px-3 py-2.5 text-right">
              <SortHeader
                label="Next"
                sortKey="next1"
                active={sortKey === "next1"}
                dir={sortDir}
                onSort={onSort}
                align="right"
              />
            </th>
            <th className="px-3 py-2.5 text-right">
              <SortHeader
                label="Next 3"
                sortKey="next3"
                active={sortKey === "next3"}
                dir={sortDir}
                onSort={onSort}
                align="right"
              />
            </th>
            <th className="px-3 py-2.5 text-right">
              <SortHeader
                label="Next 5"
                sortKey="next5"
                active={sortKey === "next5"}
                dir={sortDir}
                onSort={onSort}
                align="right"
              />
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fixture run
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, analysis: a }) => (
            <tr key={team.id} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <TeamCrest teamCode={team.code} teamShortName={team.shortName} />
                  <span className="font-medium">{team.name}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <FixtureRatingBadge window={a?.next1 ?? emptyWindow} />
              </td>
              <td className="px-3 py-2 text-right">
                <FixtureRatingBadge window={a?.next3 ?? emptyWindow} />
              </td>
              <td className="px-3 py-2 text-right">
                <FixtureRatingBadge window={a?.next5 ?? emptyWindow} />
              </td>
              <td className="px-3 py-2">
                <FixtureRun analysis={a} count={5} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const emptyWindow = { games: 0, averageDifficulty: 0, rating: 50 };

/**
 * Team-level fixture overview: every club's next-5 run, ease ratings out of
 * 100 for the next 1/3/5 fixtures, sortable by any window.
 */
export function FixturesOverview() {
  const teamsQuery = useTeams();
  const { analysis, isLoading, isError, error, refetch } = useFixtureAnalysis();

  return (
    <QueryBoundary
      isLoading={isLoading || teamsQuery.isLoading}
      isError={isError || teamsQuery.isError}
      error={error ?? teamsQuery.error}
      onRetry={refetch}
    >
      <FixturesTable teams={teamsQuery.data ?? []} analysis={analysis} />
    </QueryBoundary>
  );
}
