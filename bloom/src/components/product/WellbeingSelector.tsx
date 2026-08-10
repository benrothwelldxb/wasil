import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Icon } from '@/components/ui/icon';
import { WELLBEING_LEVELS } from '@/domain/constants';
import type { WellbeingLevel } from '@/domain/models';
import { cn } from '@/lib/utils';

const ACCENT_SELECTED: Record<string, string> = {
  sage: 'border-sage bg-sage/25',
  primary: 'border-primary bg-primary-soft',
  beige: 'border-beige bg-beige/40',
  coral: 'border-coral bg-coral/20',
};

/**
 * "How are you feeling today?" — a 4-option wellbeing picker built on an
 * accessible radio group. Expressive line icons, not cartoon emoji.
 */
export function WellbeingSelector({
  value,
  onChange,
  className,
}: {
  value: WellbeingLevel | null;
  onChange: (value: WellbeingLevel) => void;
  className?: string;
}) {
  return (
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as WellbeingLevel)}
      className={cn('grid grid-cols-4 gap-2.5', className)}
      aria-label="Overall wellbeing today"
    >
      {WELLBEING_LEVELS.map((level) => {
        const selected = value === level.value;
        return (
          <RadioGroupItem
            key={level.value}
            value={level.value}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border-2 border-border bg-card px-1 py-3.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected ? ACCENT_SELECTED[level.accent] : 'hover:bg-muted/60',
            )}
          >
            <Icon
              name={level.icon}
              className={cn('size-7', selected ? 'text-foreground' : 'text-muted-foreground')}
            />
            <span
              className={cn(
                'text-xs font-medium',
                selected ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {level.label}
            </span>
          </RadioGroupItem>
        );
      })}
    </RadioGroup>
  );
}
