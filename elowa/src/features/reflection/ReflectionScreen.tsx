import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { Icon } from '@/components/ui/icon';
import { useAISummary, useReflection } from '@/hooks/queries';
import { todayIso } from '@/lib/date';

export function ReflectionScreen() {
  const month = todayIso().slice(0, 7);
  const { data: reflection } = useReflection(month);
  const { data: aiSummary } = useAISummary();

  if (!reflection) {
    return (
      <>
        <ScreenHeader eyebrow="Monthly reflection" title="Your month" showBack />
        <Screen>
          <p className="text-sm text-muted-foreground">Preparing…</p>
        </Screen>
      </>
    );
  }

  if (reflection.checkInCount === 0) {
    return (
      <>
        <ScreenHeader eyebrow="Monthly reflection" title={`Your ${reflection.monthLabel}`} showBack />
        <Screen>
          <EmptyState icon="CalendarDays" title="Nothing recorded this month yet" description="Check in a few times and elowa will reflect on your month." />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ScreenHeader eyebrow="Monthly reflection" title={`Your ${reflection.monthLabel}`} showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">{reflection.checkInCount} check-ins this month.</p>

        {aiSummary ? (
          <Card className="mt-4 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="Sparkles" className="size-4 text-primary" />
              <Badge variant={aiSummary.source === 'ai' ? 'default' : 'neutral'}>
                {aiSummary.source === 'ai' ? 'AI summary' : 'Summary'}
              </Badge>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{aiSummary.text}</p>
          </Card>
        ) : null}

        <Block icon="Check" title="What stayed steady" items={reflection.steady} empty="Not enough to say yet." />
        <Block icon="Activity" title="What changed" items={reflection.changed} empty="Nothing notable changed." />
        <Block icon="LineChart" title="Patterns worth noticing" items={reflection.patterns} empty="No clear patterns yet." />
        {reflection.treatmentNotes.length > 0 ? (
          <Block icon="Pill" title="Treatment timeline" items={reflection.treatmentNotes} empty="" />
        ) : null}
        {reflection.cycleNote ? <Block icon="CalendarClock" title="Cycle" items={[reflection.cycleNote]} empty="" /> : null}

        <Card className="mt-4 p-4">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="ArrowRight" className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">For next month</p>
          </div>
          <p className="text-sm text-muted-foreground">{reflection.nextMonth}</p>
        </Card>

        <HealthNotice className="mt-6" compact />
      </Screen>
    </>
  );
}

function Block({ icon, title, items, empty }: { icon: string; title: string; items: string[]; empty: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <Card className="mt-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon name={icon} className="size-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it} className="text-sm leading-relaxed text-muted-foreground">
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}
