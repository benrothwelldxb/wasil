import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Consistent content wrapper: horizontal padding and generous bottom spacing so
 * content clears the bottom navigation / sticky footers.
 */
export function Screen({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn(padded && 'px-5', 'pb-28', className)}>{children}</div>
  );
}
