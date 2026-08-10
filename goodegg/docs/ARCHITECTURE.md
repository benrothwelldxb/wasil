# Architecture

Be a Good Egg is a **mobile-first single-page application** built with React,
TypeScript and Vite, talking to pluggable backends through one small interface.
Privileged logic — chiefly the Secret Buddy draw — lives **server-side** so that no
client ever holds the whole picture.

---

## 1. Frontend stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | `tsconfig.app.json` |
| UI runtime | React 18 | function components + hooks |
| Build / dev server | Vite 5 | `@` → `./src` path alias |
| Styling | Tailwind CSS 3 | custom cream/pastel tokens in `tailwind.config.ts` |
| Routing | React Router 6 | client-side routes, SPA fallback on host |
| Server state | TanStack Query 5 | caching, mutations, invalidation over the `DataProvider` |
| Client state | Zustand 4 | session, ephemeral UI state |
| Animation | Framer Motion 11 | gentle, mobile-tuned motion |
| Icons | lucide-react | |
| Fonts | Fraunces (display), Inter (body) | self-hosted via Fontsource |
| PWA | `vite-plugin-pwa` | autoUpdate, maskable icons, standalone |
| Tests | Vitest + Testing Library (jsdom) | `src/test/setup.ts` |

The design language is **80% modern app, 20% playful stationery**: a warm cream
ground, near-black ink, and a small pastel accent set (`yolk`, `lilac`, `sage`,
`coral`, `peach`), a single ~480px content column (`max-w-app`), and two motion
primitives (`egg-wobble`, `fade-up`).

---

## 2. The `DataProvider` pattern

The UI never talks to a backend directly. It talks to a **`DataProvider`** — a
single TypeScript interface whose methods return the domain shapes defined in
[`src/lib/types.ts`](../src/lib/types.ts). Two implementations satisfy it, and one
is selected at build time by an environment variable:

```
VITE_DATA_PROVIDER = "local"      → in-browser seeded demo backend
VITE_DATA_PROVIDER = "supabase"   → real Supabase project
```

```
          ┌──────────────────────────────────────────────┐
          │                 React UI                      │
          │   (routes, features, components, TanStack Q)  │
          └───────────────────────┬──────────────────────┘
                                  │  DataProvider interface
                                  │  (returns lib/types shapes)
              ┌───────────────────┴───────────────────┐
              ▼                                        ▼
   ┌────────────────────┐                  ┌────────────────────────┐
   │  LocalDataProvider  │                 │  SupabaseDataProvider   │
   │  seeded demo data   │                 │  supabase-js + RLS      │
   │  in-memory, no net  │                 │  + run-draw edge fn     │
   └────────────────────┘                  └───────────┬────────────┘
                                                       │ service role
                                              ┌────────▼─────────┐
                                              │  Postgres (RLS)   │
                                              └──────────────────┘
```

**Why this matters**

- The whole product is explorable with **zero setup** — `npm run dev` uses the
  local provider with realistic seed data (demo login: **"Ben"**). Great for design
  review and offline work.
- The Supabase provider can be developed and swapped in without touching a single
  screen, because both sides speak the same `types.ts` shapes.
- Tests and Storybook-style work can run entirely against the local provider.

Both providers return the **same shapes**, so the UI genuinely does not know which
backend is behind it. Sensitive operations (the draw) are the exception: the local
provider computes them in-process for demo purposes, while the Supabase provider
delegates to the privileged Edge Function (§5).

---

## 3. Folder structure

```
src/
├─ main.tsx            # Entry: mounts React, wires providers (Query, Router, DataProvider)
├─ index.css           # Tailwind layers + base styles
├─ assets/             # Static assets imported by code
├─ components/
│  ├─ brand/           # Logo, egg mark, wordmark — the identity
│  ├─ layout/          # App frame, navigation, screen scaffolding
│  └─ ui/              # Design-system primitives (buttons, cards, sheets…)
├─ data/               # DataProvider interface + LocalDataProvider + SupabaseDataProvider
├─ features/           # Feature modules: group, buddy profile, draw, ideas,
│                      #   questions, missions, inbox — hooks + screens per feature
├─ routes/             # Route components and the router map
├─ store/              # Zustand stores (session, UI)
├─ lib/                # Framework-free domain logic (the heart of the app)
│  ├─ types.ts         # Domain model — single source of truth
│  ├─ draw.ts          # Secret Buddy draw engine (pure, deterministic)
│  ├─ draw.test.ts     # Draw engine tests
│  ├─ ideas.ts         # Surprise idea engine + IdeaProvider extension point
│  ├─ utils.ts         # ids, join codes, date/format helpers, avatars
│  └─ cn.ts            # Tailwind class-merge helper
└─ test/               # Vitest setup

supabase/
├─ migrations/         # SQL schema + Row-Level Security policies
└─ functions/          # run-draw Edge Function (runs with the service role)
```

The **`lib/`** layer is deliberately framework-free: pure TypeScript with no React,
no network, and no provider knowledge. It is the most testable and the most
portable part of the system, and it is the source of truth for the domain.

---

## 4. The draw engine

The draw lives in [`src/lib/draw.ts`](../src/lib/draw.ts) as a **pure function**,
`computeDraw(participants, exclusions, options)`. It never writes anything; the
caller persists the result transactionally.

### 4.1 What a valid draw is

A valid draw is a permutation of participants with:

- **No fixed points** — nobody draws themselves.
- **Out-degree 1** — each person gives exactly once.
- **In-degree 1** — each person receives exactly once.
- **Every forbidden `(giver → receiver)` pair from `exclusions` avoided.**

### 4.2 Quality goals

- Avoid reciprocal `A→B` / `B→A` pairs where reasonably possible.
- **Deterministic** given a `seed` — the same inputs and seed always yield the same
  draw, so a re-run never _silently_ differs. A small `mulberry32` PRNG drives all
  shuffling.

### 4.3 Strategy — robust, not naïve retry

The engine uses a layered strategy:

1. **Randomised single-cycle generator.** Shuffling everyone into one big cycle
   yields a derangement with **no reciprocals** by construction (for _n ≥ 3_).
   The engine tries a bounded number of shuffles (`maxCycleAttempts`, default 200)
   until one also satisfies the exclusions. This is fast whenever exclusions are
   sparse — the common case. Result method: `"cycle"`.

2. **Bipartite perfect-matching fallback.** If no clean cycle is found, it builds
   the "allowed" bipartite graph (givers × permitted receivers) and runs **Kuhn's
   augmenting-paths** matching. This _provably_ finds an assignment if one exists —
   and therefore also **detects genuine infeasibility** (over-restrictive
   exclusions), throwing `DrawError('INFEASIBLE', …)`. Result method: `"matching"`.

3. **Reciprocal reduction (2-opt repair).** After matching, a best-effort 2-opt
   pass rewires reciprocal pairs (`i↔j`) via a third giver `k` — `i→j, k→l ⇒ i→l,
   k→j` — keeping a swap only when it strictly lowers the reciprocal count and
   breaks no exclusion. Some configurations have no legal swap; the result reports
   the remaining `reciprocalCount` honestly.

Guards run first: fewer than two participants → `TOO_FEW`; duplicate ids →
`DUPLICATE_IDS`; anyone forbidden from _everyone_ → `INFEASIBLE`.

A companion `validateDraw(participants, pairs, exclusions)` re-checks a produced set
of pairs against all the rules; it is used by tests and as a server-side guard
before persisting.

```
computeDraw
   │
   ├─ guards (TOO_FEW / DUPLICATE_IDS / INFEASIBLE)
   │
   ├─ Strategy 1: single-cycle shuffles ──✓──► pairs (method: "cycle", 0 reciprocals)
   │        │ (exhausted)
   │        ▼
   └─ Strategy 2: bipartite matching ──✗──► DrawError("INFEASIBLE")
            │ ✓
            ▼
         2-opt reciprocal reduction ──► pairs (method: "matching", reciprocalCount)
```

---

## 5. Where privileged logic lives

The draw is the one operation that must not run on an ordinary client, because the
full giver→receiver mapping is the most sensitive data in the system.

- In production (`supabase` provider), the draw runs inside the **`run-draw` Edge
  Function** using the **service role**. It reads participants and exclusions,
  calls `computeDraw`, validates the result, and writes all `assignments`
  **transactionally (all pairs or none)**. The client only ever triggers the draw
  and later reads its _own_ receiver.
- The `assignments` table is **not selectable** by clients through normal RLS
  (see [`SECURITY.md`](SECURITY.md)); only the privileged function writes it, and a
  narrow per-giver path lets each participant see their single receiver.
- In the local demo provider, `computeDraw` runs in-process purely so reviewers can
  experience the flow; nothing sensitive leaves the browser because there is no
  real backend.

This is a direct expression of principle **2.3 — secrecy is enforced at the
database layer, not by frontend hiding.**

---

## 6. The idea engine extension point

The surprise-idea engine lives in [`src/lib/ideas.ts`](../src/lib/ideas.ts) and is
built around a small interface so its strategy can evolve without touching the UI:

```ts
export interface IdeaProvider {
  readonly id: string
  generate(req: IdeaRequest): SurpriseIdea[]
}
```

- The default **`templateIdeaProvider`** (`id: "template"`) is a **curated template
  library — no AI API**. Each template inspects a `BuddyProfile` (drink, snacks,
  shops, interests, colours, "little things"…) and may emit an idea with a playful
  "Operation …" codename, an approximate cost, a type, and a suggested anonymous
  note.
- Results are filtered by budget (`free`/`under3`/`under5`/`under10`/`any`) and
  type, de-duplicated by title, made **safe for the buddy** (dietary requirements
  and dislikes drop obviously bad food ideas), then **seeded-sorted** and rotated by
  a `cursor` so "Another idea" always feels fresh and stays deterministic.
- **Extension point:** a future `AiIdeaProvider` can implement the same
  `IdeaProvider` contract and be swapped in — or blended with the template
  provider — without any UI change. Kindness-first framing (free ideas always
  available, never pushy about spending) is a property of the _contract_, not just
  the default implementation.

---

## 7. State management

Two complementary tools, each for what it's best at:

| Kind of state | Tool | Examples |
| --- | --- | --- |
| **Server / remote state** | TanStack Query | groups, memberships, buddy profiles, ideas, questions, missions, inbox — everything that comes from a `DataProvider` |
| **Client / ephemeral state** | Zustand | current session ("who am I"), selected group, transient UI (sheets open, filters) |

TanStack Query owns caching, background refresh, and mutation/invalidation against
whichever `DataProvider` is active. Zustand owns the small amount of local,
non-server state. Derived view models (`InboxItem`, `Membership`,
`ParticipantSummary` in `types.ts`) are assembled from query results rather than
stored.

---

## 8. Routing map

React Router 6 drives a small set of mobile screens. The concrete route table lives
in `src/routes/`; the intended map is:

| Path | Screen | Purpose |
| --- | --- | --- |
| `/` | Home | Greeting, your group, next actions, inbox peek |
| `/join/:code` | Join | Join a group from a code/link/QR |
| `/group/new` | Create group | Organiser starts a scheme |
| `/group/:id` | Group home | Status, members' completeness, organiser tools |
| `/group/:id/profile` | Buddy profile | Build/edit your `BuddyProfile` |
| `/group/:id/buddy` | Your buddy | The person you give to + "Get an idea" |
| `/group/:id/ideas` | Ideas | Browse surprise ideas with budget/type filters |
| `/group/:id/ask` | Anonymous question | Ask/answer without revealing identities |
| `/group/:id/missions` | Missions | Gentle optional prompts |
| `/inbox` | Inbox | Answered questions, new ideas, missions, accomplice nudges |

Organiser-only routes surface **logistics only** (completeness, "run the draw") —
never who drew whom (principle 2.2 / 2.3).

---

## 9. Testing

Vitest runs in a jsdom environment (`vite.config.ts` → `test`), with
`src/test/setup.ts` and Testing Library for component work. The draw engine has
dedicated coverage in `src/lib/draw.test.ts`, exercising validity (derangement,
in/out-degree), exclusion handling, infeasibility detection, and determinism under
a fixed seed. Because `lib/` is framework-free, it is fast and cheap to test
exhaustively.
