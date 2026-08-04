# Error boundaries

Phase One convention for how RouteCraft contains a thrown render error: three
boundary tiers, each catching at a different scope, plus how that relates to
the existing `ProviderError` taxonomy and query-level error UI (which handle
*expected*, recoverable failures rather than bugs).

## The three tiers

Defined in
[`src/components/shared/ErrorBoundary.tsx`](../../src/components/shared/ErrorBoundary.tsx),
[`src/components/shared/ErrorFallback.tsx`](../../src/components/shared/ErrorFallback.tsx),
and [`src/app/RouteErrorBoundary.tsx`](../../src/app/RouteErrorBoundary.tsx):

1. **Root app boundary** — one `ErrorBoundary` wraps the app's
   `RouterProvider` (highest level, mounted once). Catches anything that
   escapes every route (e.g. an error thrown by router/provider setup
   itself). If this trips, the user loses the whole app shell — it's the
   last line of defense, not the common case.
2. **Route-level `errorElement`** — every route in `router.tsx` gets
   `RouteErrorBoundary` as its `errorElement`. React Router mounts this in
   place of just that route's element, inside the same `AppShell` outlet —
   header, footer, and nav survive a thrown render/loader error in one
   route's subtree. This is the common case: a bug in `ResultsPage` doesn't
   take out the header or the ability to navigate elsewhere.
   `RouteErrorBoundary` also special-cases a 404-shaped `ErrorResponse`
   (`isRouteErrorResponse(error) && error.status === 404`) by rendering the
   existing `NotFoundPage` instead of the generic fallback — an unmatched
   route is not a bug.
3. **Opt-in section boundaries** — any feature can wrap a risky subtree
   (e.g. a third-party widget, a complex visualization) in its own
   `<ErrorBoundary>` with a scoped `fallback` and `resetKeys`, so a failure
   in that one section doesn't take out the rest of the page. Not applied
   by default anywhere in Phase One — added ad hoc where a feature owner
   judges the blast radius is worth containing.

Each tier uses the same `ErrorBoundary` class component and the same default
`ErrorFallback` — only *where* the boundary is mounted, and therefore how
much survives its trip, differs.

## `ErrorBoundary` API

```tsx
<ErrorBoundary
  fallback={CustomFallback} // optional; defaults to ErrorFallback
  onError={(error, info) => log.error('boundary caught', { error, info })}
  resetKeys={[location.pathname]} // optional; any entry changing auto-resets
>
  {children}
</ErrorBoundary>
```

- `getDerivedStateFromError` captures the thrown error into state so the
  next render shows the fallback instead of unmounting the subtree.
- `componentDidCatch` forwards `(error, info)` to `onError` — the boundary
  itself does **not** import the logger. This project's `console.*`-free
  rule means logging goes through `@/lib/logger`'s `log`, and Task 10
  (router/app wiring) passes `(error, info) => log.error(...)` as `onError`
  when it mounts the root and route boundaries, keeping this file free of a
  hard dependency on the logging module.
- `reset()` clears the error, re-rendering `children`. The default
  `ErrorFallback`'s "Try again" button calls it directly; a custom
  `fallback` receives it as a prop and can wire it to any control.
- `resetKeys` is shallow-compared (`!==` per entry) on every update; when it
  changes while an error is active, the boundary resets itself
  automatically — e.g. pass the current route path so navigating away from
  a failing view recovers without the user having to click anything.

## `ErrorFallback`

The default fallback (also reused directly by `RouteErrorBoundary`) is
styled on `StateViews`' `ErrorState` — a centered `Card`, `AlertTriangle`
icon, muted copy — but marked `role="alert"` since it represents a subtree
that failed to render, not an inline empty/error state within otherwise-
working UI. Detail shown depends on `env.isDev` (from `@/config/env`):
the real `error.message` and stack in development, generic copy in
production. Two actions: **Try again** (`reset()`) and **Back to search**
(`<Link to="/">`).

## Relationship to `ProviderError` and query-level error UI

Error boundaries and the `ProviderError` taxonomy
(`src/data/provider/errors.ts`) solve different problems and are not
substitutes for each other:

- A `ProviderError` (`UNKNOWN_AIRPORT`, `NO_ROUTES`, `INVALID_CRITERIA`,
  `PROVIDER_FAILURE`) is an **expected**, typed failure from a
  `JourneyProvider` call. It's caught by TanStack Query, surfaces as
  `query.isError` / `query.error`, and is rendered inline by `ErrorState`
  (see `docs/conventions/loading.md`'s query-level state branch) — the page
  shell, nav, and rest of the UI are never at risk, because nothing threw
  during render.
- An error boundary catches an **unexpected** failure that occurred during
  render/commit/lifecycle — a bug, not a modeled failure mode. If a
  `ProviderError` (or any other thrown value) somehow escapes a query hook
  and is thrown during render instead of being surfaced via
  `query.error`, that's exactly the case a boundary exists to contain.

In short: model expected failures as data (`ProviderError` +
`query.isError` + `ErrorState`) wherever possible; reach for an
`ErrorBoundary` for the residual case where something still throws.
