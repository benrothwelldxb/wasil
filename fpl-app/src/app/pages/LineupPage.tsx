import { PageContainer, PageHeader } from "@/components/common";
import { LineupView } from "@/features/lineup";

/**
 * Lineup route: auto-pick the best XI, bench order, captain and vice from your
 * squad, with instant manual overrides.
 */
export function LineupPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Lineup & Captain"
        description="Your best XI, bench order, captain and vice — auto-picked and fully editable."
      />
      <LineupView />
    </PageContainer>
  );
}
