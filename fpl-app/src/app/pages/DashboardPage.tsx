import { ScoutReportView } from "@/features/dashboard";

/**
 * Home screen: a proactive "personal scout report" — greets the manager and
 * surfaces what matters this gameweek (projected points, captain, value, bank,
 * insights) instead of dropping them into a builder.
 */
export function DashboardPage() {
  return <ScoutReportView />;
}
