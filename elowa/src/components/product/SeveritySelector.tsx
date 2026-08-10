import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SEVERITY_SCALE } from '@/domain/constants';
import type { Severity } from '@/domain/models';
import { cn } from '@/lib/utils';

/**
 * A 5-point severity control (None → Severe). Segmented, touch-friendly, and
 * accessible via an underlying radio group. Severity is conveyed by both the
 * label and position — never colour alone.
 */
export function SeveritySelector({
  value,
  onChange,
  label,
  className,
}: {
  value: Severity | undefined;
  onChange: (value: Severity) => void;
  /** Accessible label for the group (e.g. the symptom name). */
  label: string;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as Severity)}
      aria-label={`${label} severity`}
      className={cn('grid grid-cols-5 gap-1.5', className)}
    >
      {SEVERITY_SCALE.map((step) => {
        const selected = value === step.value;
        const intensity = step.ordinal / 4;
        return (
          <RadioGroupItem
            key={step.value}
            value={step.value}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-0.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/60',
            )}
          >
            {/* Dot whose size hints at intensity (redundant with the label). */}
            <span
              aria-hidden="true"
              className={cn(
                'rounded-full',
                selected ? 'bg-primary-foreground' : 'bg-muted-foreground/50',
              )}
              style={{ width: 4 + intensity * 8, height: 4 + intensity * 8 }}
            />
            <span className="text-[10px] font-medium leading-none">{step.label}</span>
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
