import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SeverityIndicator } from '@/components/product/SymptomRow';
import { EmptyState } from '@/components/common/EmptyState';
import { findSymptom, findContextTag } from '@/data/catalog';
import { WELLBEING_LEVELS } from '@/domain/constants';
import { formatDayMonth } from '@/lib/date';
import type { DailyCheckIn, PeriodEntry } from '@/domain/models';

const SUMMARY_SYMPTOMS = ['sym_sleep', 'sym_mood', 'sym_hot_flushes'];

/** The per-day summary revealed when a calendar day is selected. */
export function DailySummaryCard({
  date,
  checkIn,
  period,
}: {
  date: string;
  checkIn?: DailyCheckIn;
  period?: PeriodEntry;
}) {
  if (!checkIn && !period) {
    return (
      <EmptyState
        icon="CalendarDays"
        title={`Nothing logged on ${formatDayMonth(date)}`}
        description="No check-in was recorded for this day."
      />
    );
  }

  const wellbeing = checkIn
    ? WELLBEING_LEVELS.find((w) => w.value === checkIn.wellbeing)
    : undefined;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{formatDayMonth(date)}</h3>
        <div className="flex items-center gap-2">
          {checkIn?.flaggedUnusual ? <Badge variant="watch">Unusual day</Badge> : null}
          {period ? <Badge variant="outline">Period · {period.flow}</Badge> : null}
        </div>
      </div>

      {wellbeing ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <Icon name={wellbeing.icon} className="size-5 text-primary" />
          <span className="text-sm font-medium text-foreground">Overall: {wellbeing.label}</span>
        </div>
      ) : null}

      {checkIn ? (
        <div className="mt-4 space-y-2.5">
          {SUMMARY_SYMPTOMS.map((id) => {
            const symptom = findSymptom(id);
            const entry = checkIn.symptoms.find((s) => s.symptomId === id);
            if (!symptom || !entry) return null;
            return (
              <div key={id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Icon name={symptom.icon} className="size-4 text-muted-foreground" />
                  {symptom.label}
                </span>
                <SeverityIndicator severity={entry.severity} />
              </div>
            );
          })}
        </div>
      ) : null}

      {checkIn && checkIn.contextTagIds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {checkIn.contextTagIds.map((id) => {
            const tag = findContextTag(id);
            if (!tag) return null;
            return (
              <Badge key={id} variant="neutral">
                {tag.label}
              </Badge>
            );
          })}
        </div>
      ) : null}

      {checkIn?.note ? (
        <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm italic text-secondary-foreground">
          “{checkIn.note}”
        </p>
      ) : null}
    </Card>
  );
}
