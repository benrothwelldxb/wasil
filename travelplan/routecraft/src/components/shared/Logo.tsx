import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path
          d="M7 21c4-1 6-3 8-7 1.6-3.2 3.6-5 8-5.5-1 4.4-2.8 6.4-6 8-4 2-6 3.5-8 6.5"
          fill="none"
          className="stroke-accent"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23" cy="9" r="2.1" className="fill-accent" />
      </svg>
      <span className="text-lg tracking-tight">
        Route<span className="text-primary">Craft</span>
      </span>
    </span>
  );
}
