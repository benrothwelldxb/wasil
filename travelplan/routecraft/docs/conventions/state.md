# State ownership

RouteCraft splits application state across three owners. Each has exactly
one job; a piece of state lives in exactly one of them, never copied across
the boundary.

| Kind of state | Owner | Notes |
| --- | --- | --- |
| Server / journey data (search results, provider responses) | TanStack Query **only** | Never mirrored into a Zustand store. Query's cache is the single source of truth; components read it via hooks, they don't copy it into local/global state. |
| View state (theme, sort mode, result filters, draft search form) | Zustand (`useUiStore`, `useSearchStore`) | Client-only, UI-owned. Changing it never triggers a refetch — it only re-derives the view over data Query already has. |
| Search criteria for a *committed* search | The URL (`/results` query params) | The URL is the source of truth once a search is submitted. `useSearchStore`'s draft is rehydrated **from** the URL via `loadFromCriteria`, never the reverse. |

Stores never hold derived or query-owned data: no cached journeys, no
computed filter results, nothing that TanStack Query already owns or that
can be recomputed from props/URL/query state on render.

## Persisted state: `partialize` + `version`

Only `useUiStore`'s `theme` is persisted (localStorage key
`routecraft-ui`). Everything else — `sort`, `filters`, the entire
`useSearchStore` draft — is session-only and intentionally NOT persisted:
filters and sort are cheap to reset, and a draft search form persisting
silently across browser sessions would be surprising.

Rules for any store that persists to storage:

- Always set `partialize` explicitly, even if you think you want "everything"
  persisted today — an unbounded persisted shape is how query-owned or
  derived data quietly leaks into localStorage later.
- Always set a numeric `version` and a `migrate` function on the `persist`
  options, from the first version onward. `ui-store.ts` currently has an
  identity `migrate` (`version: 1`) — it does no transformation yet, but the
  hook is in place so a future shape change (e.g. renaming/restructuring the
  persisted `theme` field) has somewhere to live instead of silently
  breaking existing users' localStorage or requiring a new storage key.
- Keep the persisted shape minimal and flat. `partialize` should return the
  smallest object that reproduces user-visible preference, not a convenient
  superset.

## Theme: system-preference default + no-FOUC bootstrap

`useUiStore`'s initial `theme` (before anything is persisted) resolves the
OS-level preference via
`window.matchMedia('(prefers-color-scheme: dark)').matches`, behind an
SSR/jsdom-safe guard (`typeof window !== 'undefined' && typeof
window.matchMedia === 'function'`); it falls back to `'dark'` when that API
is unavailable. Once the user (or `toggleTheme`/`setTheme`) sets a theme,
that choice is persisted and wins over the system preference on future
loads.

Because the store only applies its class to `<html>` after React mounts
(`useTheme`'s `useEffect` in `src/hooks/use-theme.ts`), the page would
otherwise flash the wrong theme for a moment on first paint (FOUC). To avoid
that, `index.html` has an inline, synchronous `<script>` in `<head>` —
**before** the app's module script — that:

1. Reads `localStorage['routecraft-ui']` directly (the same key
   `useUiStore`'s `persist` middleware writes, shape
   `{ state: { theme }, version }`).
2. Falls back to `matchMedia('(prefers-color-scheme: dark)')` if nothing is
   persisted, matching `getInitialTheme()` in `ui-store.ts`.
3. Adds the resulting `dark`/`light` class to `document.documentElement`
   before the app script runs, so the correct theme is present at first
   paint.
4. Is wrapped in `try/catch` — a corrupt/unavailable `localStorage` value
   never blocks rendering; it just falls through to the `dark` default.

`<html>` no longer hardcodes `class="dark"` — the bootstrap script is now
solely responsible for the initial class, and `useTheme`'s effect keeps it
in sync afterward (including on toggle).

`index.html` also declares `<meta name="theme-color" content="#0f172a">` for
the initial (dark-biased) browser-chrome color; `useTheme` updates that same
meta tag's `content` to match the active theme (`#0f172a` dark, `#f8fafc`
light) whenever the theme changes, so it never drifts out of sync with
`<html>`'s class.

### CSP finding

`public/_headers` (the Cloudflare Pages headers file) currently sets no
`Content-Security-Policy` at all — it only has a `Cache-Control` rule for
`/assets/*`. There is nothing blocking the inline bootstrap `<script>` in
`index.html` today. If a CSP is added later, it must either allowlist this
specific inline script (via a hash or nonce) or the script must be
externalised and referenced by a hashed URL — a blanket `script-src 'self'`
alone would break the no-FOUC bootstrap, since it runs before any external
script tag and has no nonce today.
