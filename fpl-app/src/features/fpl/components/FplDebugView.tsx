import { useMemo } from "react";
import { RefreshCw, Users, Shield, Layers, Trophy } from "lucide-react";
import { SectionCard, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/utils";
import {
  useBootstrap,
  useFixtures,
  usePlayers,
  usePositions,
  usePrices,
  useTeams,
} from "../api";
import type {
  Fixture,
  Player,
  PlayerAvailability,
  PlayerPrice,
  Position,
  Team,
} from "../types/models";
import { DebugTable, type DebugColumn } from "./DebugTable";
import { QueryBoundary } from "./QueryBoundary";

/** Cap large datasets so the debug page stays responsive. */
const ROW_LIMIT = 25;

const AVAILABILITY_LABEL: Record<PlayerAvailability, string> = {
  available: "Available",
  doubtful: "Doubtful",
  injured: "Injured",
  suspended: "Suspended",
  unavailable: "Unavailable",
  "not-in-squad": "Not in squad",
};

function formatKickoff(iso: string | null): string {
  if (!iso) return "TBC";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function priceChangeClass(change: number): string {
  if (change > 0) return "text-success";
  if (change < 0) return "text-destructive";
  return "text-muted-foreground";
}

function LastUpdated({ at }: { at: number }) {
  if (!at) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Updated{" "}
      {new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(at))}
    </span>
  );
}

/** Small note shown when a dataset is truncated for display. */
function TruncationNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Showing first {formatNumber(shown)} of {formatNumber(total)}.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function SummaryPanel() {
  const bootstrap = useBootstrap();
  const data = bootstrap.data;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Players"
        value={data ? formatNumber(data.players.length) : "—"}
        icon={Users}
        loading={bootstrap.isLoading}
        hint={
          data ? `${formatNumber(data.totalPlayers)} total registered` : undefined
        }
      />
      <StatCard
        label="Teams"
        value={data ? data.teams.length : "—"}
        icon={Shield}
        loading={bootstrap.isLoading}
      />
      <StatCard
        label="Positions"
        value={data ? data.positions.length : "—"}
        icon={Layers}
        loading={bootstrap.isLoading}
      />
      <StatCard
        label="Current GW"
        value={data?.currentEventId ?? "—"}
        icon={Trophy}
        loading={bootstrap.isLoading}
        hint={data?.nextEventId ? `Next: GW ${data.nextEventId}` : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

function PositionsPanel() {
  const { data, isLoading, isError, error, refetch } = usePositions();
  const rows = data ?? [];

  const columns: DebugColumn<Position>[] = [
    { header: "ID", cell: (p) => p.id },
    { header: "Name", cell: (p) => p.name },
    { header: "Short", cell: (p) => p.shortName },
    {
      header: "Players",
      align: "right",
      cell: (p) => formatNumber(p.elementCount),
    },
    {
      header: "Squad play (min–max)",
      align: "right",
      hideOnMobile: true,
      cell: (p) => `${p.squadMinPlay}–${p.squadMaxPlay}`,
    },
  ];

  return (
    <SectionCard title="Positions" description="From bootstrap element_types.">
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        onRetry={() => void refetch()}
      >
        <DebugTable columns={columns} rows={rows} getRowKey={(p) => p.id} />
      </QueryBoundary>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function TeamsPanel() {
  const { data, isLoading, isError, error, refetch } = useTeams();
  const rows = data ?? [];

  const columns: DebugColumn<Team>[] = [
    { header: "ID", cell: (t) => t.id },
    { header: "Name", cell: (t) => t.name },
    { header: "Short", cell: (t) => t.shortName },
    { header: "Strength", align: "right", cell: (t) => t.strength },
    {
      header: "Att (H/A)",
      align: "right",
      hideOnMobile: true,
      cell: (t) => `${t.strengthAttackHome}/${t.strengthAttackAway}`,
    },
    {
      header: "Def (H/A)",
      align: "right",
      hideOnMobile: true,
      cell: (t) => `${t.strengthDefenceHome}/${t.strengthDefenceAway}`,
    },
  ];

  return (
    <SectionCard title="Teams" description="From bootstrap teams.">
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={rows.length === 0}
        onRetry={() => void refetch()}
      >
        <DebugTable columns={columns} rows={rows} getRowKey={(t) => t.id} />
      </QueryBoundary>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function PlayersPanel() {
  const { data, isLoading, isError, error, refetch } = usePlayers();

  // Show the most valuable players first to make the sample meaningful.
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.totalPoints - a.totalPoints),
    [data],
  );
  const rows = sorted.slice(0, ROW_LIMIT);

  const columns: DebugColumn<Player>[] = [
    { header: "Name", cell: (p) => p.webName },
    { header: "Team", cell: (p) => p.teamShortName },
    { header: "Pos", cell: (p) => p.positionShortName },
    {
      header: "£",
      align: "right",
      cell: (p) => `£${p.price.now.toFixed(1)}`,
    },
    { header: "Pts", align: "right", cell: (p) => formatNumber(p.totalPoints) },
    {
      header: "Form",
      align: "right",
      hideOnMobile: true,
      cell: (p) => p.form.toFixed(1),
    },
    {
      header: "Sel %",
      align: "right",
      hideOnMobile: true,
      cell: (p) => `${p.selectedByPercent.toFixed(1)}%`,
    },
    {
      header: "xGI",
      align: "right",
      hideOnMobile: true,
      cell: (p) => p.expectedGoalInvolvements.toFixed(2),
    },
    {
      header: "Status",
      hideOnMobile: true,
      cell: (p) => AVAILABILITY_LABEL[p.availability],
    },
  ];

  return (
    <SectionCard
      title="Players"
      description="From bootstrap elements — resolved & parsed (top by points)."
    >
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={sorted.length === 0}
        onRetry={() => void refetch()}
      >
        <DebugTable columns={columns} rows={rows} getRowKey={(p) => p.id} />
        <TruncationNote shown={ROW_LIMIT} total={sorted.length} />
      </QueryBoundary>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

function PricesPanel() {
  const { data, isLoading, isError, error, refetch } = usePrices();

  // Surface the biggest movers this gameweek.
  const sorted = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => Math.abs(b.changeEvent) - Math.abs(a.changeEvent),
      ),
    [data],
  );
  const rows = sorted.slice(0, ROW_LIMIT);

  const columns: DebugColumn<PlayerPrice>[] = [
    { header: "Player", cell: (p) => p.webName },
    { header: "Now", align: "right", cell: (p) => `£${p.now.toFixed(1)}` },
    {
      header: "GW change",
      align: "right",
      cell: (p) => (
        <span className={cn(priceChangeClass(p.changeEvent))}>
          {p.changeEvent > 0 ? "+" : ""}
          {p.changeEvent.toFixed(1)}
        </span>
      ),
    },
    {
      header: "Season change",
      align: "right",
      hideOnMobile: true,
      cell: (p) => (
        <span className={cn(priceChangeClass(p.changeStart))}>
          {p.changeStart > 0 ? "+" : ""}
          {p.changeStart.toFixed(1)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      title="Prices"
      description="Derived from player now_cost & cost changes (biggest GW movers)."
    >
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={sorted.length === 0}
        onRetry={() => void refetch()}
      >
        <DebugTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.playerId}
        />
        <TruncationNote shown={ROW_LIMIT} total={sorted.length} />
      </QueryBoundary>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function FixturesPanel() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useFixtures();

  // Upcoming (or in-progress) fixtures first.
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => (a.event ?? 999) - (b.event ?? 999)),
    [data],
  );
  const upcoming = useMemo(
    () => sorted.filter((f) => !f.finished),
    [sorted],
  );
  const rows = (upcoming.length > 0 ? upcoming : sorted).slice(0, ROW_LIMIT);

  const columns: DebugColumn<Fixture>[] = [
    { header: "GW", cell: (f) => f.event ?? "—" },
    {
      header: "Fixture",
      cell: (f) => `${f.homeTeamShort} v ${f.awayTeamShort}`,
    },
    {
      header: "Score",
      align: "right",
      cell: (f) =>
        f.homeScore !== null && f.awayScore !== null
          ? `${f.homeScore}–${f.awayScore}`
          : "–",
    },
    {
      header: "Diff (H/A)",
      align: "right",
      hideOnMobile: true,
      cell: (f) => `${f.homeDifficulty}/${f.awayDifficulty}`,
    },
    {
      header: "Kickoff",
      hideOnMobile: true,
      cell: (f) => formatKickoff(f.kickoffTime),
    },
  ];

  return (
    <SectionCard
      title="Fixtures"
      description="From /fixtures/ — resolved to team names."
      actions={<LastUpdated at={dataUpdatedAt} />}
    >
      <QueryBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={sorted.length === 0}
        onRetry={refetch}
      >
        <DebugTable columns={columns} rows={rows} getRowKey={(f) => f.id} />
        <TruncationNote
          shown={ROW_LIMIT}
          total={upcoming.length > 0 ? upcoming.length : sorted.length}
        />
      </QueryBoundary>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Composed view
// ---------------------------------------------------------------------------

/**
 * The complete FPL debug view: a summary plus a panel per dataset (positions,
 * teams, players, prices, fixtures). Every panel is independently typed and
 * handles its own loading / error / empty states.
 */
export function FplDebugView() {
  const bootstrap = useBootstrap();
  const fixtures = useFixtures();

  const refetchAll = () => {
    void bootstrap.refetch();
    fixtures.refetch();
  };

  const isRefreshing = bootstrap.isFetching || fixtures.isFetching;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <LastUpdated at={bootstrap.dataUpdatedAt} />
        <Button
          variant="outline"
          size="sm"
          onClick={refetchAll}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
          Refresh all
        </Button>
      </div>

      <SummaryPanel />
      <PositionsPanel />
      <TeamsPanel />
      <PlayersPanel />
      <PricesPanel />
      <FixturesPanel />
    </div>
  );
}
