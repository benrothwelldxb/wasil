import { PageContainer, PageHeader } from "@/components/common";
import { TransfersView } from "@/features/transfers";

/**
 * Transfer Planner route: best single / double / wildcard recommendations for
 * your saved squad, with projected gain, money remaining, and reasoning.
 */
export function TransfersPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Transfer Planner"
        description="The best single, double, and wildcard moves for your saved squad — with hits, money, and reasoning."
      />
      <TransfersView />
    </PageContainer>
  );
}
