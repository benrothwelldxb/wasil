import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A titled block within the appointment summary. Consistent, print-friendly
 * spacing so the whole summary reads as one cohesive page.
 */
export function AppointmentSection({
  icon,
  title,
  children,
  className,
}: {
  icon: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-t border-border/60 py-4 first:border-t-0 first:pt-0', className)}>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name={icon} className="size-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}
