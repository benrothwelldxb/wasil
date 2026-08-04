# RouteCraft — Implementation Plan (source of truth)

Authored by the Fable orchestration layer; implemented by Opus (scoring +
synthetic engine) and Sonnet (UI primitives + features), reviewed against the
quality gates below.

## Product

Experience-first journey discovery. Input: origin, destination, dates, pax,
budget, cabin, preferences. Output: ranked *journeys* (direct or with curated
overnight stopovers incl. hotels + transfers), scored by experience, never
exceeding budget.

## Module boundaries

- `domain/` — pure, no React/no I/O. Types, Zod schemas, geo, scoring, view.
- `data/` — `JourneyProvider` interface + deterministic synthetic engine.
  Swap boundary: `data/provider/provider-registry.ts` (one line).
- `stores/` — Zustand (search draft, UI view state). No journey data here.
- `hooks/` — TanStack Query wrappers; URL ↔ criteria parsing.
- `features/` — search, results, journey vertical slices.

## Experience scoring model (`domain/scoring/`)

> **Note (superseded scope):** the six-factor model below remains the engine
> that *ranks and sorts* the results grid. A second, complementary score shipped
> later: the proprietary **12-factor Journey Score** (`domain/journey-score/`,
> with its own `ALGORITHM.md`) powers the explainable, user-reweightable panel
> on the journey detail page. See the README "scoring" section for how the two
> relate.

1. **Hard constraint:** `cost.total ≤ budget` (else discarded pre-scoring);
   connection buffer ≥ 75 min; ≤ 4 legs. Budget is never a soft factor.
2. **Six factors, each normalised 0–100:** stopoverAppeal, comfort,
   travelTimeEfficiency (relative to fastest in set, exponent 1.5),
   layoverQuality, valueForMoney (`100 · headroomPct^0.7`), scheduleConvenience.
3. **Base weights** (`weights.ts`, sum = 1): appeal .25, comfort .20,
   time .20, layover .15, value .10, schedule .10.
4. **Preference modulation:** each selected preference multiplies one factor's
   weight (speed→time ×1.6, comfort→comfort ×1.5, relaxation→layover ×1.4,
   experience prefs→appeal ×1.35), then weights re-normalise to 1.
5. **Composite** = round(Σ factor·weight). **Ranking:** score desc, then
   value, then travel time, then id. **Badges:** best-experience (rank 1),
   fastest, best-value (max headroom), hidden-gem (score ≥ 70 in cheapest
   cost tercile).

Determinism is a hard invariant: same input → identical output.

## Provider contract

```ts
interface JourneyProvider {
  readonly id: string;
  searchJourneys(criteria, opts?: { signal? }): Promise<SearchResult>;
  getJourney(journeyId, criteria): Promise<Journey | null>;
}
```

Synthetic engine seed excludes budget & preferences, so tweaking them
reveals/hides and re-ranks journeys over a stable candidate universe rather
than regenerating the world.

## Work packages

- WP-1 Scaffold + config (Vite/TS/Tailwind/ESLint/Vitest) — done.
- WP-3 Domain types, Zod, geo, scoring engine + tests — done (Opus).
- WP-2 shadcn/ui primitive library — done (Sonnet).
- WP-4/5 Provider abstraction + synthetic engine + tests — Opus.
- WP-6 Stores, Query hooks, URL helpers, view logic — done.
- WP-7/8/9 Search, results, journey features + Framer Motion — done.
- WP-10/11/12 Integration, quality gates, Cloudflare Pages — final pass.

## Quality gates (all must pass, zero warnings)

```bash
npm ci && npm run lint && npm run test && npm run build
```

Rejection triggers: `any`/`@ts-ignore`/non-null `!` in src, `console.log`,
journey data in Zustand, UI importing `data/synthetic/*` directly, `Math.random`
/`Date.now` in generation, scoring logic outside `domain/scoring`, or any change
outside `travelplan/routecraft/`.
