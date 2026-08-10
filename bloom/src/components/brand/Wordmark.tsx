import { cn } from '@/lib/utils';
import { BRAND } from '@/config/brand';

/**
 * Temporary Bloom wordmark: a small leaf-like mark plus the name in the display
 * serif. Intentionally lightweight — the final logo comes later.
 */
export function Wordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BloomMark className="size-8 shrink-0" />
      <div className="leading-none">
        <span className="font-display text-2xl font-semibold tracking-tight text-primary">
          {BRAND.name}
        </span>
        {showTagline ? (
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            {BRAND.tagline}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function BloomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M16 8c2.4 0 4 1.8 4 4.2 0 1-.3 1.9-.9 2.6 1 .1 2 .6 2.7 1.5 1.2 1.6.9 3.9-.7 5.1-.9.7-2 .9-3 .6.1 1-.2 2-.9 2.8-1.2 1.4-3.4 1.5-4.8.3-.8-.7-1.2-1.6-1.3-2.6-1 .5-2.2.5-3.3-.1-1.8-1-2.4-3.2-1.4-5 .5-.9 1.4-1.5 2.4-1.7-.5-.7-.8-1.6-.8-2.5C8.7 10.4 11 8 13.9 8c.3 0 .5 0 .8.1.4-.1.9-.1 1.3-.1Z"
        className="fill-coral"
      />
      <circle cx="16" cy="16" r="2.4" className="fill-background" />
    </svg>
  );
}
