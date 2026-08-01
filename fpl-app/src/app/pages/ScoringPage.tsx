import { PageContainer, PageHeader } from "@/components/common";
import { ScoringView } from "@/features/scoring";

/**
 * Player Ratings route: the internal scoring engine — every player scored from
 * weighted metrics with a complete, transparent breakdown.
 */
export function ScoringPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Player Ratings"
        description="Every player scored from weighted metrics, Expected Points, and your preferences. Select a player for the full breakdown."
      />
      <ScoringView />
    </PageContainer>
  );
}
