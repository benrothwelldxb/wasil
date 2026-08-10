import type { ReactNode } from 'react';
import { IconBadge } from './IconBadge';
import { cn } from '@/lib/utils';

/** A calm, reassuring empty state for screens/sections without data yet. */
export function EmptyState({
  icon = 'Sparkles',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl bg-muted/50 px-6 py-10 text-center',
        className,
      )}
    >
      <IconBadge icon={icon} size="2xl" tone="brand" className="mb-3" />
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
