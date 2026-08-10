import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { Icon } from '@/components/ui/icon';
import { useSince, useTreatments } from '@/hooks/queries';
import { formatDayMonth, todayIso, type IsoDate } from '@/lib/date';

export function SinceScreen() {
  const { data: treatments } = useTreatments();
  const [anchor, setAnchor] = useState<{ date: IsoDate; label: string } | null>(null);
  const [customDate, setCustomDate] = useState('');
  const { data: comparison } = useSince(anchor?.date ?? null, anchor?.label ?? '');

  const anchors: { date: IsoDate; label: string }[] = [
    ...(treatments ?? []).map((t) => ({ date: t.date, label: t.title })),
    ...(treatments ?? [])
      .filter((t) => t.doseChangeDate)
      .map((t) => ({ date: t.doseChangeDate!, label: `${t.title} dose change` })),
  ];

  return (
    <>
      <ScreenHeader eyebrow="Before & after" title="What’s changed since…?" showBack />
      <Screen>
        {!anchor ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick an event and elowa will compare your patterns before and after it.
            </p>
            {anchors.length > 0 ? (
              <div className="mt-5">
                <SectionHeading>Your events</SectionHeading>
                <Card className="divide-y divide-border/60">
                  {anchors.map((a) => (
                    <button
                      key={`${a.date}_${a.label}`}
                      type="button"
                      onClick={() => setAnchor(a)}
                      className="flex min-h-14 w-full items-center gap-3 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <Icon name="Pill" className="size-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-foreground">{a.label}</span>
                        <span className="block text-xs text-muted-foreground">{formatDayMonth(a.date)}</span>
                      </span>
                      <Icon name="ChevronRight" className="size-5 text-muted-foreground" />
                    </button>
                  ))}
                </Card>
              </div>
            ) : (
              <EmptyState className="mt-5" icon="Pill" title="No treatment events yet" description="Add a treatment or use a custom date below." />
            )}

            <Card className="mt-5 p-4">
              <p className="text-sm font-semibold text-foreground">Or pick a date</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={customDate}
                  max={todayIso()}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  variant="soft"
                  size="sm"
                  disabled={!customDate}
                  onClick={() => setAnchor({ date: customDate, label: formatDayMonth(customDate) })}
                >
                  Compare
                </Button>
              </div>
            </Card>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAnchor(null)}
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              <Icon name="ChevronLeft" className="size-4" /> Choose a different event
            </button>
            <h2 className="mt-3 text-xl font-semibold text-foreground">Since {anchor.label}</h2>

            {comparison ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={comparison.dataQuality === 'good' ? 'positive' : 'watch'}>
                    {comparison.dataQuality === 'good' ? 'Good data' : 'Limited data'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {comparison.beforeDays} days before · {comparison.afterDays} days after
                  </span>
                </div>

                <Card className="mt-4 p-5">
                  <SectionHeading>What changed</SectionHeading>
                  {comparison.changes.length > 0 ? (
                    <ul className="space-y-2.5">
                      {comparison.changes.map((c) => (
                        <li key={c.key} className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{c.label}</span>
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Icon name={c.direction === 'less' ? 'ArrowRight' : 'Info'} className={c.direction === 'less' ? 'size-4 text-success' : 'size-4 text-coral'} />
                            {c.description.replace(`${c.label.toLowerCase()} `, '')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No clear changes stood out.</p>
                  )}

                  {comparison.unchanged.length > 0 ? (
                    <>
                      <div className="mt-4">
                        <SectionHeading>What stayed similar</SectionHeading>
                        <div className="flex flex-wrap gap-1.5">
                          {comparison.unchanged.map((u) => (
                            <Badge key={u} variant="neutral">
                              {u}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}
                </Card>

                <HealthNotice className="mt-4" compact>
                  {comparison.caveat}
                </HealthNotice>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Comparing…</p>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
