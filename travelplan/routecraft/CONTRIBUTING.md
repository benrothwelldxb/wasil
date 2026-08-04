# Contributing to RouteCraft

Thanks for helping craft better journeys. This is a TypeScript-strict React SPA
with a firm architectural spine — a few rules keep it maintainable.

## Getting set up

```bash
npm ci
npm run dev        # http://localhost:5173
```

## The quality gate

Every change must pass the full gate before it merges:

```bash
npm run verify     # typecheck + lint (0 warnings) + coverage + build
```

Individually: `npm run typecheck`, `npm run lint`, `npm run test:coverage`,
`npm run build`. CI runs the same gate.

- **ESLint runs with `--max-warnings 0`.** Zero warnings, not "few".
- **Coverage thresholds** (see `vite.config.ts`): 80% lines/functions/statements,
  70% branches, enforced over `domain`, `data/*`, `lib`, `config`, `stores`,
  `hooks`. Presentational components get behaviour + a11y tests (via
  `vitest-axe`) rather than a line-coverage %.
- **Determinism in tests.** No real `Date.now()`/`Math.random()` in assertions —
  use `vi.useFakeTimers()` / `vi.setSystemTime()` and the seeded RNG helpers.

## Architectural boundaries (please respect)

- **`domain/` is pure.** It imports nothing from `data/`, `react`, or any
  framework. Types, Zod schemas, geo/score math, view logic only.
- **Provider independence.** The UI must never know which provider supplies
  data. Raw provider models stay inside `src/data/**`; nothing outside `data/`
  imports engine/adapter internals, and `providerId` is never rendered. Swap the
  data source by editing only `data/provider/provider-registry.ts`.
- **State ownership.** Journey results live in TanStack Query (keyed by the
  canonical criteria string). The committed search lives in the **URL**. Draft
  form + view controls live in Zustand. Never copy journey data into Zustand.
- **Accessibility is a gate, not a polish step.** New interactive UI ships with
  labels, keyboard support, and an axe check. Motion respects
  `prefers-reduced-motion` (the app wraps Framer in
  `<MotionConfig reducedMotion="user">`).

## Branches & commits

- Branch off the default branch; keep PRs focused.
- Write conventional-ish commit subjects (`feat(results): …`, `fix(a11y): …`,
  `docs: …`, `chore(hardening): …`).
- Explain the *why* in the body when the change isn't self-evident.

## Adding a dependency

Prefer not to. The bundle is deliberately lean (system fonts, inline SVG, no
map/chart libs — a strict CSP forbids external hosts anyway). If you must add
one, justify it in the PR and check the eager-boot chunk didn't grow.
