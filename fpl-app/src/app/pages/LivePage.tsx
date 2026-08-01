import { Radio } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@/components/common";
import { ImportTeamCard, useManagerStore } from "@/features/manager";
import { LiveScoreCard, useLiveScore } from "@/features/live";

/**
 * Live gameweek score for the connected team, refreshed through match day.
 * Prompts to connect a team when none is linked, or explains when no gameweek
 * is currently live.
 */
export function LivePage() {
  const managerId = useManagerStore((s) => s.managerId);
  const live = useLiveScore();

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Live"
        description="Your team's points as the gameweek unfolds — including provisional bonus."
      />

      {managerId === null ? (
        <EmptyState
          icon={Radio}
          title="Connect your team for live points"
          description="Import your real FPL team by Manager ID to follow your score live."
          action={<ImportTeamCard />}
        />
      ) : live.isLive ? (
        <LiveScoreCard />
      ) : (
        <EmptyState
          icon={Radio}
          title="No live gameweek right now"
          description="Your live score will appear here once this gameweek's matches kick off."
        />
      )}
    </PageContainer>
  );
}
