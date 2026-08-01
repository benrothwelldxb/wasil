import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Crown, Sparkles } from "lucide-react";
import {
  PageContainer,
  PageHeader,
  RowsSkeleton,
  SectionCard,
  StatCardsSkeleton,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { PlayerAvatar, TeamBadge } from "@/features/player-explorer";
import { useOptimiser } from "@/features/optimiser";
import type { OptiPlayer } from "@/features/optimiser";
import { ROUTES } from "@/routes/paths";

const LINES: { id: number; label: string }[] = [
  { id: 1, label: "GK" },
  { id: 2, label: "DEF" },
  { id: 3, label: "MID" },
  { id: 4, label: "FWD" },
];

function PlayerChip({
  player,
  captain,
}: {
  player: OptiPlayer;
  captain: boolean;
}) {
  return (
    <div className="flex w-16 flex-col items-center gap-1 text-center">
      <div className="relative">
        <PlayerAvatar
          photoUrl={player.player.photoUrl}
          name={player.player.webName}
          size={44}
        />
        {captain && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
            C
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-[11px] font-medium leading-tight">
        {player.player.webName}
      </span>
      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <TeamBadge
          teamCode={player.player.teamCode}
          teamShortName={player.player.teamShortName}
          size={10}
        />
        {player.value.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * Landing screen: shows the best team the app auto-computes, so a first-time
 * visitor gets value in one glance — no setup, no jargon, one tap to the
 * full picker.
 */
export function DashboardPage() {
  const { result, isLoading } = useOptimiser();

  const captainId = useMemo(() => {
    if (!result) return null;
    return [...result.best.starters].sort((a, b) => b.value - a.value)[0]?.id ?? null;
  }, [result]);

  const captain = result?.best.starters.find((p) => p.id === captainId);

  return (
    <PageContainer>
      <PageHeader
        title="Your team this week"
        description="We've picked the best possible team for you. Tap through to tweak it."
      />

      {isLoading || !result ? (
        <div className="space-y-4">
          <StatCardsSkeleton count={3} />
          <RowsSkeleton rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Headline numbers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-4 text-center">
              <div className="text-xs text-muted-foreground">
                Projected points
              </div>
              <div className="text-3xl font-bold tabular-nums">
                {result.totalProjected.toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 text-center">
              <div className="text-xs text-muted-foreground">Formation</div>
              <div className="text-3xl font-bold tabular-nums">
                {result.best.formation.def}-{result.best.formation.mid}-
                {result.best.formation.fwd}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4 text-center">
              <div className="text-xs text-muted-foreground">Cost</div>
              <div className="text-3xl font-bold tabular-nums">
                £{(result.cost / 10).toFixed(0)}m
              </div>
            </div>
          </div>

          {/* Captain highlight */}
          {captain && (
            <div className="flex items-center gap-3 rounded-lg border bg-primary/5 p-4">
              <Crown className="h-6 w-6 shrink-0 text-primary" />
              <PlayerAvatar
                photoUrl={captain.player.photoUrl}
                name={captain.player.webName}
                size={44}
              />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  Suggested captain
                </div>
                <div className="truncate text-lg font-bold">
                  {captain.player.webName}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xl font-bold tabular-nums">
                  {captain.value.toFixed(1)}
                </div>
                <div className="text-[11px] text-muted-foreground">pts</div>
              </div>
            </div>
          )}

          {/* The XI */}
          <SectionCard title="Starting XI">
            <div className="space-y-4">
              {LINES.map((line) => {
                const players = result.best.starters.filter(
                  (p) => p.positionId === line.id,
                );
                if (players.length === 0) return null;
                return (
                  <div
                    key={line.id}
                    className="flex flex-wrap justify-center gap-3"
                  >
                    {players.map((p) => (
                      <PlayerChip
                        key={p.id}
                        player={p}
                        captain={p.id === captainId}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Primary call to action */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="flex-1">
              <Link to={ROUTES.optimiser}>
                <Sparkles className="h-4 w-4" />
                See the full team
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="flex-1">
              <Link to={ROUTES.players}>Browse players</Link>
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
