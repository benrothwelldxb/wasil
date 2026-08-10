import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import type { TreatmentEvent } from '@/domain/models';
import { TREATMENT_CATEGORY_META } from '@/domain/constants';
import { formatDayMonth } from '@/lib/date';
import { cn } from '@/lib/utils';

type TreatmentAccent = (typeof TREATMENT_CATEGORY_META)[keyof typeof TREATMENT_CATEGORY_META]['accent'];

const ACCENT_DOT: Record<TreatmentAccent, string> = {
  primary: 'bg-primary-soft text-primary',
  lilac: 'bg-lilac/40 text-foreground',
  sage: 'bg-sage/40 text-foreground',
  coral: 'bg-coral/30 text-foreground',
  beige: 'bg-beige/60 text-foreground',
};

/**
 * A reusable vertical treatment / intervention timeline. Renders the events the
 * user has recorded, chronologically. An optional `onSelect` makes rows tappable
 * (used on the Treatments management screen).
 */
export function TreatmentTimeline({
  events,
  className,
  showNotes = true,
  onSelect,
}: {
  events: TreatmentEvent[];
  className?: string;
  showNotes?: boolean;
  onSelect?: (event: TreatmentEvent) => void;
}) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const dose = (event: TreatmentEvent) =>
    [event.dose, event.frequency].filter(Boolean).join(' · ');

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
                  {event.endDate ? ` – ${formatDayMonth(event.endDate)}` : ''}
                </time>
                <Badge variant="neutral">{meta.label}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="mt-0.5 text-sm font-semibold text-foreground">{event.title}</p>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(event)}
                    aria-label={`Edit ${event.title}`}
                    className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="Pencil" className="size-4" />
                  </button>
                ) : null}
              </div>
              {dose(event) ? <p className="text-xs text-muted-foreground">{dose(event)}</p> : null}
              {event.doseChangeDate ? (
                <p className="text-xs text-muted-foreground">
                  Dose changed {formatDayMonth(event.doseChangeDate)}
                </p>
              ) : null}
              {showNotes && event.note ? (
                <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
