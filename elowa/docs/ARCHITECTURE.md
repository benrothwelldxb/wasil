# Architecture overview

elowa Phase 0 is a single-page React app. The guiding principle is that **a backend can be
introduced later without significant refactoring**. This is achieved with a clear, one-directional
dependency flow and a hard boundary at the service layer.

```
UI (components / features)
        │  uses hooks
        ▼
hooks (TanStack Query)  ──►  services  ──►  data (mock today, API later)
        │                        │
        ▼                        ▼
   stores (Zustand)          domain models  ◄── everything depends on these types
```

- **Components/features never import mock data directly** for their primary data — they call
  hooks, which call services. (Static catalogues like the symptom list are the one pragmatic
  exception, imported via `@/data/catalog`.)
- **Services are the only module that knows where data comes from.** Today they read the mock
  layer and return Promises via `resolveMock`. Swapping in `fetch`/a client changes only these
  files; hooks and components stay the same.
- **Domain models are dependency-free types** shared by every layer.

## Folder structure

```
elowa/
├─ public/                     Static assets (favicon)
├─ docs/                       This documentation
├─ index.html                  Entry HTML + font links
├─ tailwind.config.ts          Design tokens (colour/radius/shadow/typography mapping)
├─ postcss.config.js
├─ tsconfig*.json              Strict TypeScript project references
├─ vite.config.ts             Vite + `@/` path alias
└─ src/
   ├─ main.tsx                 React root
   ├─ App.tsx                  Providers + Router
   ├─ index.css                Design tokens (CSS variables) + base styles
   ├─ app/
   │  ├─ providers.tsx         TanStack Query provider
   │  └─ router.tsx            Route table (AppLayout vs FocusLayout)
   ├─ config/
   │  └─ brand.ts              Placeholder brand name (single source of truth)
   ├─ domain/
   │  ├─ models.ts             All domain interfaces/types
   │  └─ constants.ts          Ordered scales + display metadata (labels/icons)
   ├─ data/
   │  ├─ catalog.ts            Symptom + context-tag catalogues (reference data)
   │  └─ mock/                 Seeded demo dataset (Emma, ~12 weeks)
   │     ├─ user.ts
   │     ├─ history.ts         Deterministic check-in / period / cycle generator
   │     ├─ treatments.ts
   │     ├─ insights.ts
   │     ├─ appointment.ts
   │     ├─ articles.ts
   │     └─ index.ts           Aggregated export surface
   ├─ services/
   │  ├─ index.ts              userService, checkInService, … + query keys
   │  └─ mockDelay.ts          Promise wrapper simulating async I/O
   ├─ hooks/
   │  └─ queries.ts            TanStack Query hooks (useCurrentUser, useInsights, …)
   ├─ store/
   │  ├─ checkInDraftStore.ts  Ephemeral in-progress check-in (Zustand)
   │  └─ onboardingStore.ts    Onboarding selections (Zustand)
   ├─ lib/
   │  ├─ utils.ts              `cn` class merge
   │  ├─ date.ts               ISO-date helpers
   │  └─ calendar.ts           Month-grid builder
   ├─ components/
   │  ├─ ui/                   shadcn-style primitives (button, card, badge, tabs,
   │  │                        switch, radio-group, icon)
   │  ├─ brand/                Wordmark
   │  ├─ layout/               AppShell, AppLayout, BottomNavigation, ScreenHeader,
   │  │                        SectionHeading
   │  ├─ common/               PrimaryButton, IconButton, Screen, EmptyState,
   │  │                        HealthNotice (+ SeekAdviceCallout), PrivacyNote
   │  └─ product/              Domain-aware components: WellbeingSelector,
   │                           SeveritySelector, SymptomRow, ContextTagChip,
   │                           InsightCard, Sparkline, CalendarDay,
   │                           TreatmentTimeline, AppointmentSection, ArticleCard
   └─ features/               One folder per screen (today, checkin, insights,
                              calendar, learn, appointment, profile, onboarding)
```

## Layer responsibilities

| Layer | Responsibility | Backend swap impact |
| --- | --- | --- |
| `domain` | Types & vocabulary | None — stays identical |
| `data` | Seeded mock content | Removed/retired when API lands |
| `services` | Where data comes from | **Only layer that changes** |
| `hooks` | Caching, loading, error | None |
| `store` | Ephemeral UI state | None |
| `components`/`features` | Presentation & interaction | None |

## Routing

Two layouts share the centred **mobile app shell**:

- `AppLayout` — the primary tabbed screens, with the persistent **BottomNavigation** (Today,
  Insights, central Check-in, Learn, Me) and a keyboard "skip to content" link.
- `FocusLayout` — full-screen focused flows (`/check-in`, `/onboarding`) with no bottom bar.

On phones the shell fills the viewport; on tablet/desktop it renders as a phone-width canvas
floating on a warm backdrop (`AppShell`).

## State management

- **Server-state** (all domain data) → **TanStack Query** via `hooks/queries.ts`. Query keys are
  centralised in `services/index.ts`.
- **Ephemeral UI-state** (in-progress check-in, onboarding choices) → **Zustand** stores. These
  are intentionally non-persistent in Phase 0.

## Phase 1 additions — local persistence & analysis

Phase 1 turned the static shell into a working tracker. Two new layers were added **under** the
existing service boundary, so components and hooks were rewired but not restructured:

```
components / features
        │  hooks (TanStack Query + mutations)
        ▼
services (composition)  ──►  repositories  ──►  storage driver (localStorage today)
        │                         │
        ▼                         ▼
analysis engines (pure)     domain models
```

- **Storage** (`services/storage/`): a tiny `StorageDriver` interface with `LocalStorageDriver`
  and `MemoryStorageDriver` (tests/SSR). `dataContext.ts` picks the active driver and keeps
  **real** and **demo** data in separate key namespaces (`elowa:v1:real:` / `elowa:v1:demo:`) with
  a stored schema version. Components never touch `localStorage`.
- **Repositories** (`services/repositories/`): `CheckIn`, `Symptom` (tracking config),
  `Cycle` (periods), `Treatment`, `UserPreferences`. They are the only code that reads/writes
  storage. Swapping in a backend = changing the driver or these repository bodies.
- **Analysis engines** (`domain/analysis/`): pure, deterministic, unit-tested — `stats`,
  `baseline`, `cycle`, `insights`, `appointment`, with all thresholds in `thresholds.ts`. See
  `BASELINE.md` and `INSIGHTS.md`.
- **Safety** (`domain/safety/language.ts`): the single place health-adjacent copy is built, plus a
  `findUnsafeLanguage` lint asserted by tests.
- **Demo mode** (`services/demo.ts`, `data/demo/`): seeds a deterministic 12-week dataset into the
  demo namespace; never mixes with real data.

Data-mutation hooks write via repositories then invalidate the shared `DATA_QUERY_KEYS`, so every
screen reflects changes immediately.

## Testing

Vitest covers the non-UI logic (`npm test`): baseline resolution & states, rolling stats, cycle
derivation, insight thresholds & co-occurrence, safety language, persistence round-trips, export,
deletion, and demo determinism. Deterministic fixtures live in `src/test/factories.ts`.

## Why this survives Phase 2+

- Adding a real API = swapping the storage driver or repository bodies; services/hooks/components
  stay put.
- Adding auth = a provider + the existing `RequireOnboarded`-style guard.
- Real cloud sync = a second driver behind `dataContext`; the export bundle already defines the
  serialisation shape.
