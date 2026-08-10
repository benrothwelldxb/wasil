import { forwardRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Required accessible label — icon-only buttons must be labelled. */
  label: string;
  variant?: 'ghost' | 'soft' | 'outline';
}

/** A round, 44px, icon-only button with a mandatory accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, variant = 'ghost', className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variant === 'ghost' && 'text-foreground hover:bg-muted',
        variant === 'soft' && 'bg-primary-soft text-primary hover:bg-primary-soft/70',
        variant === 'outline' && 'border border-input text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    >
      <Icon name={icon} className="size-5" />
    </button>
  ),
);
IconButton.displayName = 'IconButton';
