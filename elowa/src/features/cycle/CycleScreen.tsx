import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { Icon } from '@/components/ui/icon';
import { usePeriods, useCycleStats, useUpsertPeriod, useRemovePeriod } from '@/hooks/queries';
import { FLOW_LEVELS, flowLabel } from '@/domain/constants';
import type { FlowLevel } from '@/domain/models';
import { formatDayMonth, todayIso } from '@/lib/date';
import { makeId } from '@/lib/id';
import { cn } from '@/lib/utils';

export function CycleScreen() {
  const { data: periods } = usePeriods();
  const { data: stats } = useCycleStats();
  const upsert = useUpsertPeriod();
  const remove = useRemovePeriod();

  const [date, setDate] = useState(todayIso());
  const [flow, setFlow] = useState<FlowLevel>('medium');

  const save = () => {
    upsert.mutate({ id: makeId('period'), date, flow });
  };

  const recent = [...(periods ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  return (
    <>
      <ScreenHeader eyebrow="Cycle tracking" title="Cycle" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Record period days and flow. elowa keeps this lightweight — it doesn’t predict your next
          period or a fertile window.
        </p>

        {/* Log a period day */}
        <Card className="mt-5 p-5">
          <p className="text-base font-semibold text-foreground">Log a period day</p>
          <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="period-date">
            Date
          </label>
          <input
            id="period-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-3 text-xs font-medium text-muted-foreground">Flow</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {FLOW_LEVELS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={flow === f.value}
                onClick={() => setFlow(f.value)}
                className={cn(
                  'min-h-11 rounded-xl border-2 px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  flow === f.value
                    ? 'border-primary bg-primary-soft text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/60',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <PrimaryButton className="mt-4" onClick={save} disabled={upsert.isPending}>
            Save period day
          </PrimaryButton>
        </Card>

        {/* Stats */}
        {stats && stats.recentLengths.length > 0 ? (
          <Card className="mt-5 p-5">
            <p className="text-base font-semibold text-foreground">Your recent cycles</p>
            <p className="mt-2 text-sm text-foreground">
              Your last {stats.recentLengths.length} recorded cycle
              {stats.recentLengths.length === 1 ? ' was' : 's were'}{' '}
              <span className="font-semibold">{stats.recentLengths.join(', ')} days</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.averageLength ? <Badge variant="neutral">Avg {stats.averageLength} days</Badge> : null}
              {stats.variability !== undefined ? (
                <Badge variant="neutral">Range {stats.variability} days</Badge>
              ) : null}
              {stats.averagePeriodDays ? (
                <Badge variant="neutral">Period ~{stats.averagePeriodDays} days</Badge>
              ) : null}
            </div>
          </Card>
        ) : (
          <EmptyState
            className="mt-5"
            icon="CalendarClock"
            title="No cycles recorded yet"
            description="Log a couple of period days and elowa will show your recent cycle lengths."
          />
        )}

        {/* Recent period days */}
        {recent.length > 0 ? (
          <div className="mt-6">
            <SectionHeading>Recent period days</SectionHeading>
            <Card className="divide-y divide-border/60">
              {recent.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-coral/20 text-foreground">
                    <Icon name="Droplet" className="size-4" />
                  </span>
                  <span className="flex-1 text-sm text-foreground">{formatDayMonth(p.date)}</span>
                  <span className="text-xs text-muted-foreground">{flowLabel(p.flow)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove period day ${formatDayMonth(p.date)}`}
                    onClick={() => remove.mutate(p.date)}
                  >
                    <Icon name="Trash2" className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </Card>
          </div>
        ) : null}

        <HealthNotice className="mt-6" compact>
          elowa reports what you record. It does not predict future periods or fertile windows.
        </HealthNotice>
      </Screen>
    </>
  );
}
