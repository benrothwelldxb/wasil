# Loading states

Phase One convention for how RouteCraft communicates "not ready yet," at
both the route level and the query level. The goal is a UI that never
flashes a bare spinner, never jumps around as content arrives, and is
always legible to assistive tech.

## Primitives

Defined in [`src/components/shared/loading.tsx`](../../src/components/shared/loading.tsx):

- **`DelayedFallback({ delayMs = 200, children })`** — renders `null` until
  `delayMs` has elapsed, then renders `children`. Wrap any skeleton in this
  so requests that resolve quickly never show a flash of loading UI.
- **`PageSkeleton()`** — a generic, page-shaped skeleton (title bar + a
  few content blocks) built from `@/components/ui/skeleton`. Carries
  `role="status"`, `aria-label="Loading"`, and an `sr-only` "Loading" text
  node for assistive tech.
- **`Loadable({ children, fallback? })`** — a `Suspense` boundary whose
  default fallback is `<DelayedFallback><PageSkeleton /></DelayedFallback>`.
  Override `fallback` when a route needs a more specific skeleton shape.

## Route-level: lazy-loaded routes

Every route component that is code-split with `React.lazy` is wrapped in
`Loadable` at the point it's rendered (e.g. in the router's element/route
config), not inside the lazy component itself:

```tsx
const ResultsPage = lazy(() => import('@/features/results/ResultsPage'));

// in the route table
<Loadable>
  <ResultsPage />
</Loadable>
```

Pass a `fallback` when the route's real layout is known well enough that a
matching skeleton beats the generic `PageSkeleton` (see "Skeletons must
match layout" below).

## Query-level: data fetching state

Every `@tanstack/react-query` consumer that renders primary page content
follows the same three-way branch on query status:

- **`isPending`** → render a skeleton that matches the shape of the loaded
  content (e.g. `ResultsSkeleton` for the results list). Never render a
  bare spinner for primary content — spinners are reserved for small,
  secondary affordances (inline button state, etc.), not for the main
  content region.
- **`isError`** → render `ErrorState` (from
  `@/components/shared/StateViews`), optionally with a message derived
  from the error.
- **Success with an empty result** → render `EmptyState` with a title,
  description, and a recovery action.

```tsx
if (query.isPending) return <ResultsSkeleton />;
if (query.isError) return <ErrorState message={query.error.message} />;
if (query.data.length === 0) return <EmptyState title="No journeys found" ... />;
return <ResultsList items={query.data} />;
```

Wrap slow-appearing skeletons in `DelayedFallback` if the query is usually
fast (e.g. served from cache) and a flash would be distracting; skip the
delay for queries that are reliably slow, where showing the skeleton
immediately is the better signal.

## Skeletons must match layout

Every skeleton — `PageSkeleton`, `ResultsSkeleton`, or a feature-specific
one — must approximate the final content's dimensions (heights, widths,
spacing) closely enough that layout shift when real content swaps in is
negligible (CLS ≈ 0). A skeleton that doesn't reserve the right space is
worse than no skeleton: build a bespoke skeleton per feature when the
generic `PageSkeleton` doesn't match (see `ResultsSkeleton` for an
example), rather than reusing a mismatched generic one.

## Accessibility

Every pending-state affordance — `PageSkeleton`, feature skeletons, and
any other loading indicator for primary content — carries `role="status"`
(plus an accessible name via `aria-label` or `aria-labelledby`, and/or
`sr-only` text) so assistive tech announces the loading state without
depending on visual skeleton shapes.
