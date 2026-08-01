import { PageContainer, PageHeader } from "@/components/common";
import { OptimiserView } from "@/features/optimiser";

/**
 * Squad Optimiser route: the mathematically highest-scoring legal squad for
 * your budget and horizon, with every selection explained.
 */
export function OptimiserPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Squad Optimiser"
        description="The highest projected-points legal squad within budget. Pick a horizon and formation; every player is explained."
      />
      <OptimiserView />
    </PageContainer>
  );
}
