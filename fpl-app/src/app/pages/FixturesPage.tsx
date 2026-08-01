import { PageContainer, PageHeader } from "@/components/common";
import { FixturesOverview, GameweekPlanner } from "@/features/fixtures";

/**
 * Fixtures & Chip Planner route: a forward-looking blank/double gameweek
 * planner plus every club's upcoming run with difficulty-coloured tickers and
 * ease ratings. Updates automatically as gameweeks are played.
 */
export function FixturesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Fixtures & Chip Planner"
        description="Spot blank and double gameweeks ahead, then plan your chips. Plus every club's upcoming fixture difficulty and ease ratings."
      />
      <div className="space-y-6">
        <GameweekPlanner />
        <FixturesOverview />
      </div>
    </PageContainer>
  );
}
