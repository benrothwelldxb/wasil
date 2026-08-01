import { PageContainer, PageHeader } from "@/components/common";
import { FplDebugView } from "@/features/fpl";

/**
 * Developer debug page: fetches and displays all data from the FPL data layer
 * (players, teams, positions, prices, fixtures) to verify the API service,
 * caching, and normalization end-to-end.
 */
export function DebugPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Data Debug"
        description="Live view of everything retrieved from the FPL API data layer."
      />
      <FplDebugView />
    </PageContainer>
  );
}
