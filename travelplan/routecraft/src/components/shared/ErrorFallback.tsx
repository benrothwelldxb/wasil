import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { env } from '@/config/env';

/**
 * Default fallback rendered by `ErrorBoundary` (and reused by
 * `RouteErrorBoundary`) when a subtree throws. Styled on
 * `StateViews`' `ErrorState` — a centered Card with an `AlertTriangle`,
 * muted copy, and recovery actions — but scoped with `role="alert"` since
 * it represents an unrecoverable render failure rather than an inline
 * empty/error state within otherwise-working UI.
 */
export function ErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card role="alert" className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <AlertTriangle className="mb-2 h-10 w-10 text-destructive" aria-hidden="true" />
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            {env.isDev
              ? error.message
              : 'We hit a snag rendering this page. Please try again, or head back to search.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {env.isDev && error.stack ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.stack}
            </pre>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to search</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
