import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RELATIVE_STATUS_SCALE } from '@/domain/constants';
import type { RelativeStatus } from '@/domain/models';
import { cn } from '@/lib/utils';

const TONE_SELECTED: Record<'positive' | 'neutral' | 'watch', string> = {
  positive: 'border-success bg-success/10 text-foreground',
  neutral: 'border-primary bg-primary-soft text-foreground',
  watch: 'border-coral bg-coral/15 text-foreground',
};

/**
 * elowa's primary check-in control: change relative to the user's usual range.
 * Accessible single-select; conveys state by label + position, not colour alone.
 */
export function RelativeStatusSelector({
  value,
  onChange,
  label,
  className,
}: {
  value: RelativeStatus | undefined;
  onChange: (value: RelativeStatus) => void;
  label: string;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as RelativeStatus)}
      aria-label={`${label} — compared with usual`}
      className={cn('grid grid-cols-2 gap-1.5', className)}
    >
      {RELATIVE_STATUS_SCALE.map((step) => {
        const selected = value === step.value;
        return (
          <RadioGroupItem
            key={step.value}
            value={step.value}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-xl border-2 px-2 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              selected
                ? TONE_SELECTED[step.tone]
                : 'border-border bg-card text-muted-foreground hover:bg-muted/60',
            )}
          >
            {step.label}
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
