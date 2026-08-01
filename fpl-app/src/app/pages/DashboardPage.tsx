import { Activity, TrendingUp, Trophy, Users } from "lucide-react";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  StatCard,
} from "@/components/common";

/**
 * Placeholder dashboard. Demonstrates the page primitives (container, header,
 * stat cards, empty state) without any FPL-specific data or logic.
 */
export function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Your season at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overall points" value="—" icon={Trophy} />
        <StatCard label="Gameweek rank" value="—" icon={TrendingUp} />
        <StatCard label="Team value" value="—" icon={Activity} />
        <StatCard label="Mini-leagues" value="—" icon={Users} />
      </div>

      <div className="mt-6">
        <EmptyState
          title="Nothing to show yet"
          description="This is a foundations scaffold. Feature widgets will render here once the app's features are built."
        />
      </div>
    </PageContainer>
  );
}
