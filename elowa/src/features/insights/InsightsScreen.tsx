import { useMemo } from 'react';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InsightCard } from '@/components/product/InsightCard';
import { BaselineBand } from '@/components/product/BaselineBand';
import { FrequencyDots } from '@/components/product/FrequencyDots';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { IconBadge } from '@/components/common/IconBadge';
import { Icon } from '@/components/ui/icon';
import { Link } from 'react-router-dom';
import {
  useAnalysis,
  useArticles,
  useCurrentUser,
  useInsights,
  useAllSymptoms,
  useSetInsightFeedback,
} from '@/hooks/queries';
import { insightKey } from '@/domain/analysis/insights';
import { BASELINE, INSIGHTS } from '@/domain/analysis/thresholds';
import { lastN } from '@/domain/analysis/stats';

const STATE_LABEL: Record<string, string> = {
  insufficient: 'Not enough data yet',
  learning: 'Learning',
  established: 'Established',
  recalibrating: 'Recalibrating',
};

export function InsightsScreen() {
  const { data: insights } = useInsights();
  const { data: analysis } = useAnalysis();
  const { data: user } = useCurrentUser();
  const { data: symptoms } = useAllSymptoms();
  const { data: articles } = useArticles();
  const setFeedback = useSetInsightFeedback();

  const learnTitleFor = (slug?: string) =>
    slug ? articles?.find((a) => a.slug === slug)?.title : undefined;

  const labelOf = useMemo(() => {
    const map = new Map((symptoms ?? []).map((s) => [s.id, s.label]));
    return (id: string) => map.get(id) ?? 'Symptom';
  }, [symptoms]);

  const overall = analysis?.overall;
  const pinned = user?.pinnedSymptomIds ?? [];
  const bands = pinned
    .map((id) => analysis?.symptoms.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a) && a!.baseline.n >= BASELINE.MIN_DAYS);

  const notEnough = !overall || overall.distinctDays < INSIGHTS.MIN_LOGGED_DAYS;

  return (
    <>
      <ScreenHeader eyebrow="Patterns over time" title="Insights" />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Gentle observations from your own check-ins, compared with your usual range. These describe
          patterns — never a cause or a diagnosis.
        </p>

        <div className="mt-3 flex gap-2">
          <Link to="/reflection" className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
            <Icon name="CalendarDays" className="size-3.5" /> Your month
          </Link>
          <Link to="/since" className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
            <Icon name="Activity" className="size-3.5" /> What’s changed since…?
          </Link>
        </div>

        {/* Baseline status */}
        {overall ? (
          <Card className="mt-5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Your baseline</p>
              <Badge variant={overall.state === 'established' ? 'positive' : 'neutral'}>
                {STATE_LABEL[overall.state]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {overall.state === 'established'
                ? `elowa has learned your usual range from ${overall.distinctDays} days of check-ins.`
                : `${overall.distinctDays} of ${BASELINE.LEARNING_TARGET_DAYS} days recorded. Keep checking in.`}
            </p>
          </Card>
        ) : null}

        {/* Insights */}
        <div className="mt-6">
          <SectionHeading>What we’re noticing</SectionHeading>
          {insights && insights.length > 0 ? (
            <div className="space-y-3">
              {insights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  {...(learnTitleFor(insight.learnSlug) ? { learnTitle: learnTitleFor(insight.learnSlug) } : {})}
                  onFeedback={(value) => setFeedback.mutate({ insightKey: insightKey(insight), value })}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="LineChart"
              title="Not enough data yet"
              description={
                notEnough
                  ? 'Once you have around a week of check-ins, patterns will start to appear here.'
                  : 'Nothing stands out from your usual range right now — that’s good news.'
              }
            />
          )}
        </div>

        {/* Usual range bands */}
        {bands.length > 0 ? (
          <div className="mt-8">
            <SectionHeading>Your usual range</SectionHeading>
            <div className="space-y-3">
              {bands.map((a) => {
                const recent = lastN(a.values, 14);
                const worseCount = recent.filter((v) => v.worse).length;
                return (
                  <Card key={a.symptomId} className="p-4">
                    <div className="flex items-center gap-3">
                      <IconBadge
                        icon={(symptoms ?? []).find((s) => s.id === a.symptomId)?.icon ?? 'Circle'}
                        size="md"
                        tone="brand"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{labelOf(a.symptomId)}</p>
                        <p className="text-xs text-muted-foreground">{STATE_LABEL[a.baseline.state]}</p>
                      </div>
                      <FrequencyDots
                        days={lastN(recent, 7)}
                        summary={`Worse than usual on ${lastN(recent, 7).filter((v) => v.worse).length} of the last ${Math.min(7, recent.length)} check-ins`}
                      />
                    </div>
                    <BaselineBand
                      className="mt-3"
                      low={a.baseline.low}
                      high={a.baseline.high}
                      values={recent.map((v) => v.value)}
                      summary={`Recent ${labelOf(a.symptomId).toLowerCase()} values relative to your usual range; worse than usual on ${worseCount} of the last ${recent.length} check-ins.`}
                    />
                  </Card>
                );
              })}
            </div>
          </div>
        ) : null}

        <HealthNotice className="mt-7" compact>
          These patterns come only from what you’ve recorded on this device. They describe
          associations, not causes, and don’t replace advice from a healthcare professional.
        </HealthNotice>
      </Screen>
    </>
  );
}
