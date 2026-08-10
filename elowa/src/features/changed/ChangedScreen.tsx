import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { useHowChanged } from '@/hooks/queries';
import { formatDayMonth } from '@/lib/date';
import type { ChangeBucket } from '@/domain/models';

const BUCKETS: { key: ChangeBucket; label: string; icon: string; tone: string }[] = [
  { key: 'improved', label: 'Easing', icon: 'ArrowRight', tone: 'text-success' },
  { key: 'changed', label: 'More noticeable', icon: 'Activity', tone: 'text-coral' },
  { key: 'new', label: 'Newly appearing', icon: 'Sparkles', tone: 'text-primary' },
  { key: 'stable', label: 'Holding steady', icon: 'Minus', tone: 'text-muted-foreground' },
];

export function ChangedScreen() {
  const { data: summary } = useHowChanged();

  const hasData = summary && summary.lines.length > 0;

  return (
    <>
      <ScreenHeader eyebrow="Looking back" title="How have I changed?" showBack />
      <Screen>
        {summary ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Comparing the start and end of {formatDayMonth(summary.rangeStart)} – {formatDayMonth(summary.rangeEnd)}.
          </p>
        ) : null}

        {!hasData ? (
          <EmptyState
            className="mt-6"
            icon="CalendarClock"
            title="Not enough history yet"
            description="Keep checking in — after a few months elowa can show how things have shifted over time."
          />
        ) : (
          <div className="mt-5 space-y-5">
            {BUCKETS.map((b) => {
              const lines = summary!.lines.filter((l) => l.bucket === b.key);
              if (lines.length === 0) return null;
              return (
                <div key={b.key}>
                  <SectionHeading>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={b.icon} className={`size-4 ${b.tone}`} />
                      {b.label}
                    </span>
                  </SectionHeading>
                  <Card className="divide-y divide-border/60">
                    {lines.map((l) => (
                      <div key={`${b.key}_${l.label}`} className="p-4">
                        <p className="text-sm font-medium text-foreground">{l.label}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{l.text}</p>
                      </div>
                    ))}
                  </Card>
                </div>
              );
            })}

            {summary!.treatmentContext.length > 0 ? (
              <div>
                <SectionHeading>What else was happening</SectionHeading>
                <Card className="p-4">
                  <ul className="space-y-1.5">
                    {summary!.treatmentContext.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Icon name="Pill" className="mt-0.5 size-4 text-primary" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            ) : null}

            <HealthNotice compact>{summary!.caveat}</HealthNotice>
          </div>
        )}
      </Screen>
    </>
  );
}
