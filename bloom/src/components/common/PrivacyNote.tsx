import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Subtle, recurring privacy reassurance. Privacy is a visible part of the
 * product, not buried in settings.
 */
export function PrivacyNote({
  children = 'Your health data is private and belongs to you.',
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground',
        className,
      )}
    >
      <Icon name="Lock" className="size-3.5" />
      <span>{children}</span>
    </p>
  );
}
