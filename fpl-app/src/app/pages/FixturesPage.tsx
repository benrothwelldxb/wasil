import { PageContainer, PageHeader } from "@/components/common";
import { FixturesOverview } from "@/features/fixtures";

/**
 * Fixtures route: every club's upcoming run with difficulty-coloured tickers
 * and ease ratings out of 100, sortable by the next 1/3/5 fixtures.
 */
export function FixturesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Fixtures"
        description="Upcoming fixture difficulty and ease ratings for every club. Updates automatically as gameweeks are played."
      />
      <FixturesOverview />
    </PageContainer>
  );
}
