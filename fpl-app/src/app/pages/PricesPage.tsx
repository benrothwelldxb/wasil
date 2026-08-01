import { PageContainer, PageHeader } from "@/components/common";
import { PriceWatchView } from "@/features/price-watch";

/** Price Watch route: likely risers and fallers by transfer momentum. */
export function PricesPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Price Watch"
        description="Who's likely to rise or fall next, ranked by transfer momentum this gameweek."
      />
      <PriceWatchView />
    </PageContainer>
  );
}
