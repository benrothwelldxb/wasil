import { PageContainer, PageHeader } from "@/components/common";
import { SquadBuilder } from "@/features/squad-builder";

/**
 * Squad Builder route — pick a rules-valid 15-player FPL squad within budget.
 */
export function SquadPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Squad Builder"
        description="Pick 15 players within £100m. Your selection is saved on this device."
      />
      <SquadBuilder />
    </PageContainer>
  );
}
