import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Crown, Sparkles, Wallet } from "lucide-react";
import {
  EmptyState,
  PageContainer,
  RowsSkeleton,
  SectionCard,
  StatCardsSkeleton,
} from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/features/player-explorer";
import { useSquadStore } from "@/features/squad-builder";
import { ROUTES } from "@/routes/paths";
import { INSIGHT_EMOJI } from "../insights";
import { useScoutReport } from "../useScoutReport";

/**
 * The home-screen "personal scout report": greets the manager and proactively
 * surfaces what matters this gameweek — projected points, captain, squad value,
 * bank, and headline insights — instead of dropping them into a builder.
 */
export function ScoutReport() {
  const report = useScoutReport();
  const setPlayers = useSquadStore((s) => s.setPlayers);
  const navigate = useNavigate();

  const useThisTeam = () => {
    setPlayers(report.teamIds);
    navigate(ROUTES.lineup);
  };

  if (report.isLoading) {
    return (
      <PageContainer>
        <div className="mb-4 h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="space-y-4">
          <StatCardsSkeleton count={3} />
          <RowsSkeleton rows={4} />
        </div>
      </PageContainer>
    );
  }

  if (!report.hasTeam) {
    return (
      <PageContainer>
        <EmptyState
          icon={Sparkles}
          title="Let's build your team"
          description="We'll create a full squad for you in seconds."
          action={
            <Button asChild>
              <Link to={ROUTES.optimiser}>Pick my team</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Greeting */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {report.greeting}
        </h1>
        <p className="text-sm text-muted-foreground">
          {report.gameweek !== null
            ? `Gameweek ${report.gameweek} · your scout report`
            : "Your scout report"}
          {report.source === "suggested" && " (suggested team)"}
        </p>
      </div>

      {/* Headline card */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">
              Projected points this week
            </div>
            <div className="text-4xl font-bold tabular-nums">
              {report.projectedPoints.toFixed(1)}
            </div>
          </div>
          {report.captain && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 p-2 pr-3">
              <div className="relative">
                <PlayerAvatar
                  photoUrl={report.captain.photoUrl}
                  name={report.captain.webName}
                  size={40}
                />
                <Crown className="absolute -right-1 -top-1 h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Captain</div>
                <div className="text-sm font-semibold">
                  {report.captain.webName}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
          <div>
            <div className="text-xs text-muted-foreground">Squad value</div>
            <div className="text-lg font-bold tabular-nums">
              £{report.squadValue.toFixed(1)}m
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Wallet className="h-3 w-3" /> Bank
            </div>
            <div className="text-lg font-bold tabular-nums">
              £{report.bank.toFixed(1)}m
            </div>
          </div>
        </div>
      </div>

      {/* Insights */}
      {report.insights.length > 0 && (
        <SectionCard title="Insights" className="mt-4">
          <ul className="space-y-2.5">
            {report.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span aria-hidden className="shrink-0 text-base leading-tight">
                  {INSIGHT_EMOJI[insight.tone]}
                </span>
                <span>{insight.text}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Chip Watch */}
      <SectionCard title="Chip Watch" className="mt-4">
        {report.chips.length > 0 ? (
          <ul className="space-y-2.5">
            {report.chips.map((chip) => (
              <li key={chip.chip} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-xl leading-none"
                >
                  {chip.emoji}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{chip.name}</span>
                    <Badge
                      variant={chip.status === "play" ? "default" : "secondary"}
                    >
                      {chip.headline}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {chip.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            💤 No chips worth playing this week — save them for a blank or double
            gameweek.
          </p>
        )}

        {report.chipOutlook.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Looking ahead
            </div>
            <ul className="space-y-2">
              {report.chipOutlook.map((o) => (
                <li key={o.event} className="flex items-start gap-2.5 text-sm">
                  <span aria-hidden className="shrink-0 leading-tight">
                    {o.emoji}
                  </span>
                  <span className="text-muted-foreground">{o.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {/* Actions */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {report.source === "yours" ? (
          <>
            <Button asChild size="lg" className="flex-1">
              <Link to={ROUTES.lineup}>
                View my lineup
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="flex-1">
              <Link to={ROUTES.transfers}>Plan transfers</Link>
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="flex-1" onClick={useThisTeam}>
              Use this team
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild size="lg" variant="outline" className="flex-1">
              <Link to={ROUTES.optimiser}>See full team</Link>
            </Button>
          </>
        )}
      </div>

      {report.source === "suggested" && (
        <Badge variant="secondary" className="mt-3">
          This is a suggested team — save it to track your own.
        </Badge>
      )}
    </PageContainer>
  );
}
