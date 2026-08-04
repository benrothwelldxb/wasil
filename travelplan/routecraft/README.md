# RouteCraft

**Craft the journey, not just the flight.**

RouteCraft is an experience-first journey discovery SPA. Instead of returning
one direct flight, it discovers stopover cities, adds hotels and transfers,
enforces your budget as a hard cap, and ranks whole journeys by *experience*.

> "I don't care how I get there. Find me the best overall travel experience
> within my budget."

Example: **Dubai → Manchester** on a $1,500 budget with a *culture* preference
surfaces a 1-night Istanbul stopover — hotel and transfers included — ranked
above the direct red-eye.

## Tech stack

React 18 · TypeScript (strict) · Vite · Tailwind · shadcn/ui · TanStack Query ·
Zustand · React Router · Framer Motion · Zod. Deploys to Cloudflare Pages.

## Architecture

```
src/
  domain/        Pure, framework-free: types, Zod schemas, geo math,
                 the experience-scoring engine, and view (filter/sort) logic.
                 100% unit-tested; imports nothing from data/ or React.
  data/          Journey provider abstraction. A deterministic synthetic engine
                 sits behind the JourneyProvider interface — swap in a real API
                 by changing one line in provider/provider-registry.ts.
  stores/        Zustand: search draft + UI view state (theme, filters, sort).
  hooks/         TanStack Query wrappers around the provider + URL parsing.
  features/      Vertical UI slices: search, results, journey.
  components/ui  shadcn/ui primitives.
  components/shared  App shell, header/footer, score ring, state views.
  app/           Router + providers.
```

**State ownership.** Journey results live in TanStack Query (keyed by the
canonical criteria string; deterministic data, so `staleTime: Infinity`). The
committed search lives in the **URL** (shareable, refresh-safe). The draft form
and view controls (theme/filters/sort) live in Zustand. Journey data is never
copied into Zustand; filtering/sorting re-derives the view without refetching.

RouteCraft has **two complementary scores**, each with a distinct job:

**1. Experience score (ranking).** Six normalised factors — stopover appeal,
comfort, travel-time efficiency, connection quality, value-for-money, schedule
convenience — combined with preference-weighted, re-normalised weights. This is
the score that **ranks and sorts** the results grid. Budget is a *hard
constraint*, never a soft factor. See `src/domain/scoring/`.

**2. Journey Score (explainable, user-reweightable).** A proprietary 12-factor
score shown on the journey detail page: cost, cabin quality, hotel quality,
weather, transfers, duration, jet lag, airport quality, tourist appeal,
neighbourhood quality, food rating, and safety. Each factor is a transparent
0–100 sub-score; the composite is a null-redistributing weighted mean (missing
factors — e.g. no hotel on a direct flight — drop out and their weight
renormalises, so direct and stopover journeys share one 0–100 scale). Users can
**re-weight every factor live** via the Journey Score panel and see the score and
its top contributors recompute deterministically. See
`src/domain/journey-score/` and its `ALGORITHM.md`.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
```

## Scripts / quality gates

```bash
npm run lint          # eslint, zero warnings allowed
npm run test          # vitest (domain, data, hooks, components)
npm run test:coverage # vitest with v8 coverage + thresholds
npm run build         # tsc -b && vite build (+ PWA service worker)
npm run verify        # typecheck + lint + coverage + build (the full gate)
```

## Deployment (Cloudflare Pages)

**One command:**

```bash
npm run deploy     # tsc -b && vite build && wrangler pages deploy dist
```

`wrangler` reads `CLOUDFLARE_API_TOKEN` (and, for a first deploy, prompts to
create/select the `routecraft` project). Config lives in `wrangler.toml`
(`pages_build_output_dir = "dist"`). Local preview of the production build:

```bash
npm run build && npx wrangler pages dev dist
```

Alternatively, via the Cloudflare dashboard (Git-connected build):

| Setting | Value |
| --- | --- |
| Root directory | `travelplan/routecraft` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `20` (env `NODE_VERSION=20`) |

**Static-hosting artifacts** (all in `public/`, copied verbatim to `dist/`):

- `_redirects` (`/* /index.html 200`) — SPA fallback so `/results` and
  `/journeys/:id` deep links resolve.
- `_headers` — immutable caching on hashed `/assets/*`, plus a strict
  **Content-Security-Policy** (`script-src`/`style-src 'self'`, no inline —
  the no-FOUC theme boot lives in `/theme-init.js`, not an inline script) and
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, and HSTS.
- `robots.txt` + `sitemap.xml`, plus OG/Twitter tags and a dual light/dark
  `theme-color` in `index.html` for shareable-link previews.

The app is fully static — no secrets, no API keys in the bundle. When a real
journey provider is added later, its keys belong in a Pages Function proxy,
never in the client.

### PWA & offline

RouteCraft is an installable PWA (`vite-plugin-pwa`, `generateSW`, auto-update)
with a web manifest and maskable icons. The service worker precaches the app
shell and hashed assets and falls back to `index.html` for navigations, so —
because the journey engine runs entirely client-side against a deterministic
synthetic dataset — **search, results, and journey detail all work fully
offline** once the shell is cached, not just a fallback page.

### Known accepted risk

`react-router-dom` is pinned to the latest 6.x (6.30.x). Advisory
GHSA-wrjc-x8rr-h8h6 (open redirect) covers the entire 6.x line with no patched
6.x release; a fix requires a major bump to 7.18+. RouteCraft passes no
attacker-controlled paths to `navigate()` (all navigation targets are built
from validated criteria), so this is an accepted risk pending a v7 migration.

## Swapping the data provider

The synthetic engine implements `JourneyProvider`. To use a real API, add
`data/<provider>/YourProvider.ts` implementing the same interface and return it
from `getJourneyProvider()` in `data/provider/provider-registry.ts`. No UI
changes required.
