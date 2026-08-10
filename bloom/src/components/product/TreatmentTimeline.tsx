import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import type { TreatmentEvent } from '@/domain/models';
import { TREATMENT_CATEGORY_META } from '@/domain/constants';
import { formatDayMonth } from '@/lib/date';
import { cn } from '@/lib/utils';

const ACCENT_DOT: Record<string, string> = {
  primary: 'bg-primary-soft text-primary',
  lilac: 'bg-lilac/40 text-foreground',
  sage: 'bg-sage/40 text-foreground',
  coral: 'bg-coral/30 text-foreground',
  beige: 'bg-beige/60 text-foreground',
};

/**
 * A reusable vertical treatment / intervention timeline. Overlaying it against
 * symptom trends comes later; for now it renders mock events chronologically.
 */
export function TreatmentTimeline({
  events,
  className,
  showNotes = true,
}: {
  events: TreatmentEvent[];
  className?: string;
  showNotes?: boolean;
}) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ol className={cn('relative space-y-0', className)}>
      {sorted.map((event, index) => {
        const meta = TREATMENT_CATEGORY_META[event.category];
        const isLast = index === sorted.length - 1;
        return (
          <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
            {/* Connector line */}
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute left-[19px] top-10 h-[calc(100%-1.75rem)] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                'z-10 flex size-10 shrink-0 items-center justify-center rounded-full',
                ACCENT_DOT[meta.accent],
              )}
            >
              <Icon name={meta.icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2">
                <time className="text-xs font-medium text-muted-foreground">
                  {formatDayMonth(event.date)}
                </time>
                <Badge variant="neutral">{meta.label}</Badge>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{event.title}</p>
              {event.dosage ? (
                <p className="text-xs text-muted-foreground">{event.dosage}</p>
              ) : null}
              {showNotes && event.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
              ) : null}
              {showNotes && event.clinicianNote ? (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  Note: {event.clinicianNote}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
