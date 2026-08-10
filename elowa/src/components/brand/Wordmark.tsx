import { cn } from '@/lib/utils';
import { BRAND } from '@/config/brand';

/**
 * The elowa wordmark: the name set in the display serif, lowercase, in the deep
 * brand green — a clean, typographic mark matching the brand.
 */
export function Wordmark({
  className,
  size = 'md',
  showTagline = false,
}: {
  className?: string;
  size?: 'md' | 'lg';
  showTagline?: boolean;
}) {
  return (
    <div className={cn('inline-flex flex-col items-start leading-none', className)}>
      <span
        className={cn(
          'font-display font-semibold lowercase tracking-tight text-primary',
          size === 'lg' ? 'text-5xl' : 'text-2xl',
        )}
      >
        {BRAND.name}
      </span>
      {showTagline ? (
        <span
          className={cn(
            'font-medium text-muted-foreground',
            size === 'lg' ? 'mt-3 text-sm' : 'mt-1.5 text-xs',
          )}
        >
          {BRAND.tagline}
        </span>
      ) : null}
    </div>
  );
}
