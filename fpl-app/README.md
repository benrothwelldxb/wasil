# FPL App — Foundations

Production-ready architecture and reusable framework for a modern **Fantasy
Premier League** web application. This scaffold contains **no FPL features** —
only the application shell, UI system, routing, state, and data layers that
future features are built on.

## Tech stack

- **React 19** + **TypeScript** (strict)
- **Vite** build tooling
- **Tailwind CSS** + **shadcn/ui** (Radix primitives)
- **TanStack Query** — server state
- **Zustand** — client state
- **React Router** — routing with nested layouts
- **React Hook Form** + **Zod** — forms & validation
- **Axios** — HTTP client
- `clsx`, `class-variance-authority`, `tailwind-merge`, `lucide-react`

## Getting started

```bash
npm install
cp .env.example .env   # optional: configure VITE_API_BASE_URL
npm run dev            # start the dev server
npm run build          # type-check + production build
npm run typecheck      # types only (zero errors expected)
npm run lint           # eslint
```

## Project structure

```
src/
  app/            # App root, providers, error boundary, page placeholders
  assets/         # Static assets
  components/
    ui/           # shadcn/ui primitives (button, card, sheet, …)
    common/       # Reusable app components (PageHeader, StatCard, …)
  features/       # Feature modules — EMPTY by design (see features/README.md)
  hooks/          # Shared hooks (useTheme, useMediaQuery)
  layouts/        # RootLayout, AppLayout, header/nav/footer shell
  lib/            # cn(), env, query client
  routes/         # Router config, paths, navigation model
  services/
    api/          # Axios instance, interceptors, typed helpers
  store/          # Zustand app store (theme, sidebar, loading)
  styles/         # Global CSS + theme tokens
  types/          # Shared TypeScript types
  utils/          # Framework-agnostic helpers (theme, formatting)
```

## Architecture notes

- **Path alias** `@/*` → `src/*` (configured in `tsconfig` and `vite.config`).
- **Theming**: light / dark / system with `localStorage` persistence and a
  pre-paint script in `index.html` to avoid a flash of the wrong theme.
- **State**: cross-cutting UI state in Zustand; server state in TanStack
  Query. No domain state is mixed into the app store.
- **API layer**: a single Axios instance with request/response interceptors
  and normalised errors, exposed through typed `api.get/post/...` helpers. No
  endpoints are defined yet.
- **Reusability**: every shared component lives in `components/` with a barrel
  export, ready to compose in features.

## Adding a feature

See [`src/features/README.md`](src/features/README.md) for the feature-module
conventions.
