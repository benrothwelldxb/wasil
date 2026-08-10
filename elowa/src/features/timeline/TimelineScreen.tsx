import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { useTimeline, useAddMilestone } from '@/hooks/queries';
import { formatDayMonth, todayIso, type IsoDate } from '@/lib/date';
import type { TimelineFilter } from '@/domain/models';
import { cn } from '@/lib/utils';

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'symptoms', label: 'Symptoms' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'treatments', label: 'Treatments' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'notes', label: 'Notes' },
];

export function TimelineScreen() {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const { data: chapters } = useTimeline(filter);
  const addMilestone = useAddMilestone();
  const [adding, setAdding] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDate, setNoteDate] = useState<IsoDate>(todayIso());

  const isEmpty = (chapters ?? []).length === 0;

  const submitMilestone = () => {
    if (!noteTitle.trim()) return;
    addMilestone.mutate({ date: noteDate, title: noteTitle.trim() });
    setNoteTitle('');
    setNoteDate(todayIso());
    setAdding(false);
  };

  return (
    <>
      <ScreenHeader
        eyebrow="Your story"
        title="Timeline"
        trailing={
          <button
            type="button"
            aria-label="Add a milestone"
            onClick={() => setAdding((v) => !v)}
            className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name={adding ? 'X' : 'Plus'} className="size-5" />
          </button>
        }
      />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          The moments that mattered — changes, treatments, appointments and notes. Everyday check-ins
          stay in your calendar.
        </p>

        {adding ? (
          <Card className="mt-4 space-y-3 p-4">
            <p className="text-sm font-semibold text-foreground">Add a milestone</p>
            <input
              type="text"
              value={noteTitle}
              onChange={(ev) => setNoteTitle(ev.target.value)}
              placeholder="e.g. Started walking each morning"
              className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="date"
              value={noteDate}
              max={todayIso()}
              onChange={(ev) => setNoteDate(ev.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={!noteTitle.trim()} onClick={submitMilestone}>
                Add to timeline
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="mt-4 -mx-5 overflow-x-auto px-5 pb-1">
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  filter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isEmpty ? (
          <EmptyState
            className="mt-6"
            icon="Compass"
            title="Your timeline is taking shape"
            description="As you track, elowa highlights meaningful shifts, treatment changes and appointments here."
          />
        ) : (
          <div className="mt-5 space-y-7">
            {(chapters ?? []).map((chapter) => (
              <section key={chapter.month}>
                <h2 className="mb-2 px-1 text-sm font-semibold text-foreground">{chapter.label}</h2>
                <Card className="divide-y divide-border/60">
                  {chapter.events.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-4">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <Icon name={e.icon} className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{e.title}</p>
                        {e.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{e.detail}</p> : null}
                        <p className="mt-1 text-xs text-muted-foreground">{formatDayMonth(e.date)}</p>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </Screen>
    </>
  );
}
