import { BarChart3 } from "lucide-react";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from "@/components/common";

/** Placeholder for the Analyse route. */
export function AnalysePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Analyse"
        description="Dig into stats, fixtures, and trends."
      />
      <SectionCard
        title="Analysis tools"
        description="Charts and comparisons will appear here."
      >
        <EmptyState
          icon={BarChart3}
          title="No analysis available"
          description="Analytical views will be added as features are built on these foundations."
        />
      </SectionCard>
    </PageContainer>
  );
}
