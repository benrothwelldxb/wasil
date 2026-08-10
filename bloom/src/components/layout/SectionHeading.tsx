import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A small, consistent section label with an optional trailing action/link. */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </h2>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}
