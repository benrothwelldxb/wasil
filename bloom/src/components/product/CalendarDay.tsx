import type { IsoDate } from '@/lib/date';
import { cn } from '@/lib/utils';

export interface DayMarkers {
  logged: boolean;
  period: boolean;
  unusual: boolean;
  treatment: boolean;
  note: boolean;
}

/**
 * A single calendar cell. Markers are shown as small shaped dots AND described
 * in the accessible label, so nothing depends on colour alone.
 */
export function CalendarDay({
  date,
  dayNumber,
  markers,
  selected = false,
  isToday = false,
  onSelect,
}: {
  date: IsoDate;
  dayNumber: number;
  markers: DayMarkers;
  selected?: boolean;
  isToday?: boolean;
  onSelect?: (date: IsoDate) => void;
}) {
  const labelParts: string[] = [];
  if (markers.logged) labelParts.push('checked in');
  if (markers.period) labelParts.push('period day');
  if (markers.unusual) labelParts.push('flagged unusual');
  if (markers.treatment) labelParts.push('treatment change');
  if (markers.note) labelParts.push('has a note');
  const aria = `${dayNumber}${labelParts.length ? `, ${labelParts.join(', ')}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(date)}
      aria-label={aria}
      aria-pressed={selected}
      className={cn(
        'relative flex aspect-square w-full flex-col items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        selected
          ? 'bg-primary text-primary-foreground'
          : markers.logged
            ? 'bg-primary-soft/60 text-foreground hover:bg-primary-soft'
            : 'text-foreground hover:bg-muted/60',
        isToday && !selected && 'ring-1 ring-primary/40',
      )}
    >
      <span className={cn('font-medium', markers.unusual && !selected && 'text-attention')}>
        {dayNumber}
      </span>
      {/* Marker dots */}
      <span className="mt-0.5 flex h-1.5 items-center gap-0.5" aria-hidden="true">
        {markers.period ? (
          <span className={cn('size-1.5 rounded-full', selected ? 'bg-primary-foreground' : 'bg-coral')} />
        ) : null}
        {markers.treatment ? (
          <span className={cn('size-1.5 rounded-full', selected ? 'bg-primary-foreground' : 'bg-lilac')} />
        ) : null}
        {markers.note ? (
          <span className={cn('size-1.5 rounded-sm', selected ? 'bg-primary-foreground' : 'bg-sage')} />
        ) : null}
      </span>
    </button>
  );
}
