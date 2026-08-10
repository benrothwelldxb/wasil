import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { InsightCard } from '@/components/product/InsightCard';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { useInsights } from '@/hooks/queries';

export function InsightsScreen() {
  const { data: insights, isLoading } = useInsights();

  return (
    <>
      <ScreenHeader
        eyebrow="Patterns over time"
        title="Insights"
        trailing={<Badge variant="example">In development</Badge>}
      />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Gentle observations from your check-ins. These describe patterns — they never
          diagnose or explain cause.
        </p>

        <div className="mt-6">
          <SectionHeading>What we're noticing</SectionHeading>
          {isLoading ? (
            <EmptyState icon="LineChart" title="Gathering your patterns…" />
          ) : insights && insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="LineChart"
              title="Not enough data yet"
              description="Keep checking in and patterns will begin to appear here."
            />
          )}
        </div>

        <HealthNotice className="mt-7" compact>
          These example insights are illustrative and use mock data. Patterns describe what
          tends to occur alongside what — they are not medical advice.
        </HealthNotice>
      </Screen>
    </>
  );
}
