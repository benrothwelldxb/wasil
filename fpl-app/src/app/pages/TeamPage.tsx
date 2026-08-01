import { Users } from "lucide-react";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
} from "@/components/common";

/** Placeholder for the Team route. */
export function TeamPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Team"
        description="Manage and review your squad."
      />
      <SectionCard title="My squad" description="Squad management lives here.">
        <EmptyState
          icon={Users}
          title="No team configured"
          description="Team selection and pitch view will be implemented as features."
        />
      </SectionCard>
    </PageContainer>
  );
}
