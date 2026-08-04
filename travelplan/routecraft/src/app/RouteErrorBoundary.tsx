import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

import { ErrorFallback } from '@/components/shared/ErrorFallback';
import { NotFoundPage } from '@/components/shared/StateViews';

/**
 * Normalises whatever `useRouteError()` hands back — a thrown `Error`, a
 * router `ErrorResponse` (from a loader/action `Response`, or an unmatched
 * route), or an arbitrary thrown value — into a real `Error` so it can be
 * handed to `ErrorFallback`.
 */
function toError(error: unknown): Error {
  if (isRouteErrorResponse(error)) {
    const detail = typeof error.data === 'string' ? error.data : error.statusText;
    return new Error(`${error.status}: ${detail || 'Route error'}`);
  }
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('An unexpected error occurred.');
}

/**
 * Route-level `errorElement`. Rendered in place of the failing route's
 * element, inside the same `AppShell` outlet — the header, footer, and nav
 * survive a thrown render/loader error in one route's subtree. See
 * `docs/conventions/errors.md` for how this fits alongside the root
 * `ErrorBoundary` and query-level error UI.
 *
 * Must be rendered inside a router context (it uses `useRouteError`,
 * `useNavigate`) — i.e. as a route's `errorElement`, not mounted standalone.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <ErrorFallback
      error={toError(error)}
      reset={() => {
        // `navigate(0)` re-runs the current route's data/render lifecycle
        // (equivalent to `history.go(0)`), which clears the router's
        // internal error state — unlike navigating to the same pathname,
        // which react-router treats as a no-op.
        navigate(0);
      }}
    />
  );
}
