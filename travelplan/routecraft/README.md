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

**Experience score.** Six normalised factors — stopover appeal, comfort,
travel-time efficiency, connection quality, value-for-money, schedule
convenience — combined with preference-weighted, re-normalised weights. Budget
is a *hard constraint*, never a soft factor. See `src/domain/scoring/`.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173
```

## Scripts / quality gates

```bash
npm run lint       # eslint, zero warnings allowed
npm run test       # vitest (domain + synthetic engine)
npm run build      # tsc -b && vite build
npm run test:coverage
```

## Deployment (Cloudflare Pages)

| Setting | Value |
| --- | --- |
| Root directory | `travelplan/routecraft` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `20` (env `NODE_VERSION=20`) |

`public/_redirects` (`/* /index.html 200`) provides the SPA fallback so
`/results` and `/journeys/:id` deep links resolve. `public/_headers` sets
immutable caching on hashed assets. The app is fully static — no secrets, no
API keys. When a real journey provider is added later, its keys belong in a
Pages Function proxy, never in the client bundle.

Local preview of the production build:

```bash
npm run build && npx wrangler pages dev dist
```

## Swapping the data provider

The synthetic engine implements `JourneyProvider`. To use a real API, add
`data/<provider>/YourProvider.ts` implementing the same interface and return it
from `getJourneyProvider()` in `data/provider/provider-registry.ts`. No UI
changes required.
