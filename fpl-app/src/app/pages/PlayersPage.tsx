import { PageContainer, PageHeader } from "@/components/common";
import { PlayerExplorer } from "@/features/player-explorer";

/**
 * Player Explorer route — browse, filter, and sort every FPL player.
 */
export function PlayersPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Player Explorer"
        description="Browse every Premier League player. Search, filter, and sort to find your picks."
      />
      <PlayerExplorer />
    </PageContainer>
  );
}
