import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A single-tap selectable option with consistent selected/unselected styling,
 * focus ring and `aria-pressed` semantics. Shared by onboarding (reason list &
 * symptom grid) and the check-in "unusual day" toggle so the selection idiom
 * lives in one place.
 */
export function SelectableOption({
  selected,
  onToggle,
  children,
  icon,
  showCheckWhenSelected = false,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Optional leading icon; swapped for a check when selected (if enabled). */
  icon?: string;
  showCheckWhenSelected?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'flex min-h-14 w-full items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected
          ? 'border-primary bg-primary-soft'
          : 'border-border bg-card hover:bg-muted/50',
        className,
      )}
    >
      {icon ? (
        <Icon
          name={showCheckWhenSelected && selected ? 'Check' : icon}
          className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}
        />
      ) : null}
      {children}
    </button>
  );
}
