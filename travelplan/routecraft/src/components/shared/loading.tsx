import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Renders nothing until `delayMs` has elapsed, then renders `children`.
 *
 * Use this to wrap loading skeletons so fast responses never show a
 * skeleton flash — only requests that actually take a while will reveal
 * the fallback.
 */
export function DelayedFallback({
  delayMs = 200,
  children,
}: {
  delayMs?: number;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => {
      setReady(true);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}

/**
 * A generic, page-shaped loading skeleton: a title bar plus a few content
 * blocks. Intended as the default fallback for route-level `Suspense`
 * boundaries via `Loadable`.
 */
export function PageSkeleton() {
  return (
    <div className="container space-y-6 py-8" role="status" aria-label="Loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-1/3" />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

/**
 * Route-level lazy-loading convention: a `Suspense` boundary whose default
 * fallback is a delayed, page-shaped skeleton. Pass `fallback` to override
 * it for a specific route.
 */
export function Loadable({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <DelayedFallback>
            <PageSkeleton />
          </DelayedFallback>
        )
      }
    >
      {children}
    </Suspense>
  );
}
