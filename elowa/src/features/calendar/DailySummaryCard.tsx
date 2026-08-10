import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/common/EmptyState';
import { relativeStatusMeta, severityLabel, flowLabel } from '@/domain/constants';
import { formatDayMonth } from '@/lib/date';
import type { DailyCheckIn, PeriodEntry, TreatmentEvent } from '@/domain/models';

/** The per-day detail revealed when a calendar day is selected. */
export function DailySummaryCard({
  date,
  checkIn,
  period,
  treatments,
  symptomLabel,
  onEdit,
  onDelete,
}: {
  date: string;
  checkIn?: DailyCheckIn;
  period?: PeriodEntry;
  treatments: TreatmentEvent[];
  symptomLabel: (id: string) => string;
  onEdit: (date: string) => void;
  onDelete: (date: string) => void;
}) {
  if (!checkIn && !period && treatments.length === 0) {
    return (
      <EmptyState
        icon="CalendarDays"
        title={`Nothing logged on ${formatDayMonth(date)}`}
        description="No check-in was recorded for this day."
      />
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{formatDayMonth(date)}</h3>
        <div className="flex items-center gap-2">
          {checkIn?.feltNormal ? <Badge variant="positive">Normal day</Badge> : null}
          {checkIn && !checkIn.feltNormal ? <Badge variant="watch">Something different</Badge> : null}
          {period ? <Badge variant="outline">Period · {flowLabel(period.flow)}</Badge> : null}
        </div>
      </div>

      {checkIn?.feltNormal ? (
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground">
          Felt within your usual range.
        </p>
      ) : null}

      {checkIn && checkIn.observations.length > 0 ? (
        <div className="mt-4 space-y-2">
          {checkIn.observations.map((o) => (
            <div key={o.symptomId} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{symptomLabel(o.symptomId)}</span>
              <span className="text-muted-foreground">
                {o.status ? relativeStatusMeta(o.status).short : null}
                {o.severity ? `${o.status ? ' · ' : ''}${severityLabel(o.severity)}` : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {checkIn && checkIn.contextTagIds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {checkIn.contextTagIds.map((id) => (
            <Badge key={id} variant="neutral">
              {id.replace('ctx_', '').replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      ) : null}

      {treatments.length > 0 ? (
        <div className="mt-4 space-y-1">
          {treatments.map((t) => (
            <p key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
              <Icon name="Pill" className="size-4 text-primary" />
              {t.title}
            </p>
          ))}
        </div>
      ) : null}

      {checkIn?.note ? (
        <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm italic text-secondary-foreground">
          “{checkIn.note}”
        </p>
      ) : null}

      {checkIn ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(date)}>
            <Icon name="Pencil" className="size-4" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-attention hover:bg-attention/10"
            onClick={() => onDelete(date)}
          >
            <Icon name="Trash2" className="size-4" /> Delete
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
