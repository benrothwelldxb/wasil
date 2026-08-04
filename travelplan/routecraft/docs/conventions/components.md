# Component layers

RouteCraft splits components across three directories. Each has a single
job; a component lives in exactly one of them, and code never blurs the
boundary (e.g. a `ui/` primitive importing a store, or a `features/`
component being re-exported as if it were a generic primitive).

| Directory | What lives there | Rules |
| --- | --- | --- |
| `src/components/ui/` | Vendored shadcn primitives (`button.tsx`, `dialog.tsx`, `select.tsx`, ...) | `cva` variants only. No app/business logic, no imports from `@/domain`, `@/data`, `@/stores`, or `@/features`. Props are generic HTML/Radix props (plus `className`, `asChild` where shadcn provides it) — never app-specific prop names like `journey` or `criteria`. |
| `src/components/shared/` | App-generic composites used across multiple features (`AppShell`, `Header`, `Footer`, `SkipLink`, `Logo`, `StateViews`, `loading`) | May know about the app's identity (brand, routes, theme) and may import `ui/` primitives and hooks, but stay feature-agnostic — no imports from `@/features/*` and no knowledge of a specific feature's domain types. |
| `src/features/*/` | Feature-specific components (`features/search`, `features/results`, `features/journey`) | May import `ui/` and `shared/` freely, own their feature's domain logic, data hooks, and layout. Not imported by `ui/` or `shared/`. |

If you're unsure which layer a new component belongs in, ask: "does this
know what a journey/search/result is?" If yes, it's a feature component. If
it's a layout/chrome piece with no feature knowledge, it's `shared/`. If
it's a bare, reusable UI primitive with no RouteCraft-specific meaning at
all, it's `ui/`.

## Vendoring a new shadcn primitive

RouteCraft vendors shadcn/ui components as plain source files rather than
depending on a component package, so new primitives are added by hand:

1. Add the new file directly under `src/components/ui/` (e.g.
   `tabs.tsx`), following the shape of an existing primitive in that
   directory — a `cva` variants object (when the component has variants),
   `React.forwardRef` wrapping the underlying Radix/DOM element, and `cn()`
   from `@/lib/utils` to merge caller `className` with the base classes.
2. Keep the file self-contained: only imports from `react`,
   `@radix-ui/react-*`, `class-variance-authority`, `lucide-react`, and
   `@/lib/utils`. No data/store/feature imports — see the table above.
3. Reuse the existing design tokens (`bg-background`, `text-foreground`,
   `text-muted-foreground`, `border-input`, `bg-primary` /
   `text-primary-foreground`, `bg-accent`, `ring-ring`, etc.) rather than
   introducing new raw colors, so the component matches the rest of the
   system automatically in both themes.
4. Every interactive element needs a visible keyboard-focus state:
   `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
   focus-visible:ring-offset-2` (see `button.tsx`, `dialog.tsx`'s close
   button) — never remove the browser's focus indicator without providing
   this replacement.
5. Export the component(s) from the file; import them elsewhere via
   `@/components/ui/<file>`. Do not add a barrel/index file for `ui/` —
   each primitive is imported from its own module.
6. Add a colocated `<name>.test.tsx` for any primitive with meaningful
   interactive behavior (variants, open/close state, keyboard handling) —
   see `button.test.tsx` and `dialog.test.tsx` for the pattern: plain
   `@testing-library/react` + `@testing-library/user-event`, wrapped in
   `<MemoryRouter>` locally if the component needs routing context (there is
   no shared render wrapper), plus a `vitest-axe` check.

## Accessibility baseline

These are non-negotiable for anything in `shared/` or `ui/` (and for
feature components that render page-level structure):

- **Landmarks.** Exactly one `<header>` (banner), `<main>` (main), and
  `<footer>` (contentinfo) per page, provided by `AppShell` /
  `Header` / `Footer`. Feature pages render *into* `<main>` via `<Outlet
  />` — they don't add their own competing `<header>`/`<main>`/`<footer>`.
- **Skip link.** `AppShell` renders `<SkipLink />` as its first child,
  before `<Header />`. It's the first tabbable element on every page and
  jumps keyboard/screen-reader users straight to `<main id="main">`
  (`href="#main"`), skipping repeated header navigation. `main` carries
  `tabIndex={-1}` so it's a valid focus target for the jump even though
  it's not normally in the tab order.
- **Primary navigation.** Header nav links are wrapped in
  `<nav aria-label="Primary">`. Use React Router's `NavLink` (not `Link`)
  for in-app links so the active route automatically gets
  `aria-current="page"` — don't compute or set `aria-current` by hand.
- **Labelled icon-only controls.** Any button/link whose visible content is
  only an icon (e.g. the theme toggle) must have an `aria-label` that
  describes the *action*, ideally reflecting current state (e.g. "Switch to
  light mode" while dark is active) rather than a static label like "Theme".
- **Focus-visible rings.** Every interactive element (buttons, links,
  inputs, dialog triggers/close buttons) shows a visible focus ring via
  Tailwind's `focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2` (paired with `focus-visible:outline-none` to
  replace, not stack on top of, the browser default). Never ship a custom
  interactive element with `outline-none` and no replacement ring.
- **No visual redesign for a11y fixes.** Landmark/labelling/focus-ring work
  should not change layout, spacing, or color at rest — focus rings and the
  skip link are only visible during keyboard interaction, so a diff limited
  to accessibility should look identical when nothing is focused.
