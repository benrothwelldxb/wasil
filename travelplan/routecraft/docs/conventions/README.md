# RouteCraft conventions

Phase One foundation conventions. Each document is owned by exactly one
implementation task and describes a platform concern. Keep these current — a
convention that drifts from the code is a bug.

| Doc | Concern | Summary |
| --- | --- | --- |
| [env.md](./env.md) | Environment variables | Typed, Zod-validated `import.meta.env` behind `@/config/env`; `import.meta.env` is referenced nowhere else. |
| [flags.md](./flags.md) | Feature flags | Typed flag registry resolved once at boot; `useFlag` / `<Flag>` to gate. |
| [logging.md](./logging.md) | Logging | Level-based logger with pluggable sink; the only sanctioned `console.*` call site. |
| [http.md](./http.md) | API layer | Generic typed fetch client with normalised `HttpError`; the data-provider seam sits above it. |
| [errors.md](./errors.md) | Error boundaries | Root + route-level React error boundaries with reset and designed fallbacks. |
| [loading.md](./loading.md) | Loading states | `Loadable` / delayed skeletons; layout-matching, low-CLS, `role="status"`. |
| [testing.md](./testing.md) | Testing framework | `renderWithProviders`, msw, vitest-axe, coverage thresholds. |
| [components.md](./components.md) | Component library | `ui/` shadcn primitives vs `shared/` composites vs `features/`. |
| [state.md](./state.md) | State management | Query owns server data; Zustand owns view state; URL owns search criteria. |
| [analytics.md](./analytics.md) | Analytics / events | Typed engagement events through a pluggable sink; the learning-flywheel foundation. |

Quality gates for every change (run from `travelplan/routecraft/`):

```bash
npm run typecheck   # zero TypeScript errors
npm run lint        # zero lint errors/warnings
npm run test:ci     # tests + coverage thresholds
npm run build       # build succeeds with no env vars set
```
