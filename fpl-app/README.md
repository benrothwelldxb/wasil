# MyFPLScout — Fantasy Premier League Companion

A production-ready Fantasy Premier League companion: statistical **Expected
Points** projections, a **squad optimiser**, a **lineup & captaincy** picker,
a **transfer planner**, and a configurable **preference engine** that
personalises every recommendation — all driven by the public FPL API. **No AI
or LLMs** are used; every engine is transparent and inspectable.

Built as a modern, installable **PWA** with offline support.

## Tech stack

- **React 19** + **TypeScript** (strict) + **Vite 6**
- **Tailwind CSS** + **shadcn/ui** (Radix primitives)
- **TanStack Query** (server state, persisted) + **Zustand** (client state)
- **React Router** (nested layouts, lazy routes)
- **React Hook Form** + **Zod** (validation)
- **vite-plugin-pwa** (Workbox service worker) · **Vitest** (tests)

## Features

| Route | What it does |
| --- | --- |
| `/` Dashboard | Overview placeholder |
| `/players` | Virtualised, filterable/sortable explorer for every player |
| `/ratings` | Weighted player scoring engine, personalised, with full breakdowns |
| `/predictions` | Statistical **xPts** for the next 1/3/5/8 GWs, fully itemised + confidence |
| `/optimiser` | Highest projected-points **legal squad** for a budget & horizon |
| `/lineup` | Auto best XI, bench order, captain & vice — with manual overrides |
| `/transfers` | Best single / double / **wildcard** moves, with hits & reasoning |
| `/squad` | Manual squad builder enforcing all FPL rules |
| `/fixtures` | Fixture-difficulty analysis & coloured runs |
| `/preferences` | Preference profiles + onboarding that personalise the engines |

## Architecture

Feature-based, one folder per vertical slice under `src/features/`, each with a
public `index.ts` barrel. Shared UI lives in `src/components`, cross-cutting
state in `src/store`, the API layer in `src/services`.

Recommendation engines compose in a clean, one-directional graph:

```
predictions ─► optimiser ─► transfers
     │            │            ▲
     └──► lineup ─┴────────────┘
preferences ─► scoring        (all consume predictions/fixtures)
```

- **`predictions`** is a standalone engine behind a `PredictionEngine`
  interface, so a future ML model can replace it without touching consumers.
- **`preferences`** exposes a `PreferenceService`; every recommendation engine
  runs its scores through it for personalisation + transparency.
- All tuning coefficients live in single config files
  (`predictions/config.ts`, `scoring/config.ts`, `optimiser/config.ts`).

```
src/
  app/            App root, providers, error boundary, pages
  components/     ui/ (shadcn), common/ (PageHeader, StatCard, skeletons…)
  features/       fpl, fixtures, player-explorer, squad-builder, preferences,
                  scoring, predictions, optimiser, lineup, transfers
  hooks/          useTheme, useMediaQuery, useDebouncedValue, useOnlineStatus
  layouts/        RootLayout, AppLayout (shell), header/nav/footer
  lib/            cn(), env, query client
  routes/         router (lazy), paths, navigation model
  services/api/   Axios instance, interceptors, typed helpers
  store/          Zustand app store (theme, sidebar, loading)
  styles/         Global CSS + theme tokens + a11y/motion
  test/           test factories
```

## Getting started

```bash
npm install
cp .env.example .env      # optional: set VITE_API_BASE_URL
npm run dev               # http://localhost:5173  (proxies /api to the FPL API)
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with the FPL API proxy |
| `npm run build` | Type-check + production build (zero warnings) |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest suite |

## API

The app talks to the public FPL API through a relative `/api` base URL. In
**development**, Vite proxies `/api/*` to `https://fantasy.premierleague.com`
(the FPL API sends no CORS headers, so a browser can't call it directly). In
**production**, the included Cloudflare Pages Function at
`functions/api/[[path]].ts` proxies `/api/*` to the FPL API on the deployed
origin — no extra setup on Cloudflare Pages. To use a different backend
instead, set `VITE_API_BASE_URL`.

## PWA & offline

- Installable (web app manifest + maskable icon), auto-updating service worker.
- **Persistent caching**: the TanStack Query cache is saved to `localStorage`,
  so the app renders instantly from cache on reload.
- **Offline mode**: the service worker caches the app shell, FPL API responses
  (stale-while-revalidate), and player/club images (cache-first). An offline
  banner appears when the network drops; cached data stays usable.

## Accessibility & performance

- WCAG-AA minded: skip-to-content link, semantic landmarks, `aria-current`
  navigation, labelled controls, visible focus rings, and
  `prefers-reduced-motion` support.
- Route-level **code splitting** (lazy pages), vendor chunk splitting,
  virtualised long lists, memoised engines, debounced search, lazy images with
  graceful fallbacks, and skeleton loaders.

## Testing

Vitest covers the pure engine logic — squad rules, the Poisson prediction
model (contributions sum exactly to xPts), the optimiser constraints, and the
lineup auto-pick:

```bash
npm run test
```

## Deployment

Config for **both** Cloudflare styles is included — use whichever you deploy
with. Neither requires buying a domain: a free `*.workers.dev` /
`*.pages.dev` subdomain is provided (a custom domain can be attached later at
no cost).

### Cloudflare Workers (`*.workers.dev`)

`wrangler.jsonc` + `worker/index.ts` serve the built SPA and proxy `/api/*`.

```bash
npm run build
npx wrangler deploy
```

- SPA routing: `assets.not_found_handling: "single-page-application"`.
- `/api/*`: proxied by `worker/index.ts` (`assets.run_worker_first: true`
  lets the Worker run before asset fallback).

### Cloudflare Pages (`*.pages.dev`)

- **Build command:** `npm run build` · **Output directory:** `dist`
- `/api/*`: proxied by the Pages Function `functions/api/[[path]].ts`.
- SPA deep-link fallback: generated `dist/404.html` (the `postbuild` step —
  avoids Cloudflare's `_redirects` "infinite loop" validation); the service
  worker then serves `index.html` (200) on refresh.
- `public/_headers`: caching + security headers.

## Adding a feature

See `src/features/README.md` for the feature-module conventions. New
recommendation surfaces should consume `usePredictions()` /
`usePreferenceService()` rather than re-deriving values.
