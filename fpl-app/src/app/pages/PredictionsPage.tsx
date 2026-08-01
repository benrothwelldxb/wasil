import { PageContainer, PageHeader } from "@/components/common";
import { PredictionsView } from "@/features/predictions";

/**
 * Expected Points route: the statistical xPts engine — every player's
 * projected points for the next 1/3/5/8 gameweeks with a full breakdown.
 */
export function PredictionsPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Expected Points"
        description="Statistical xPts predictions for the next 1, 3, 5 and 8 gameweeks — every contribution inspectable, no AI."
      />
      <PredictionsView />
    </PageContainer>
  );
}
