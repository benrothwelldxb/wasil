import { cn } from '@/lib/utils';

/**
 * A compact row of dots for the recent window — filled when the symptom was
 * worse than usual that day, hollow otherwise. Paired with a text summary for
 * assistive tech (never colour alone: filled vs hollow is a shape difference).
 */
export function FrequencyDots({
  days,
  summary,
  className,
}: {
  days: { worse: boolean }[];
  summary: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={summary}>
      {days.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full border',
            d.worse ? 'border-coral bg-coral' : 'border-border bg-transparent',
          )}
        />
      ))}
    </span>
  );
}
