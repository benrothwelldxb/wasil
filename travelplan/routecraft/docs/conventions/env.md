# Environment variables

Typed, Zod-validated access to `import.meta.env` lives behind
`@/config/env`. `import.meta.env` is referenced **nowhere else** in the
codebase — every module that needs a runtime setting imports `env` (or
`assertEnv`) from `src/config/env.ts` instead.

## Why

`import.meta.env.VITE_*` values are always `string | undefined` at the type
level and completely unchecked at runtime — a typo'd Cloudflare Pages
variable or a malformed URL silently becomes a bug three layers away from
where it was set. Centralising and validating them once, at boot, turns that
into an immediate, readable failure instead.

## The module

`src/config/env.ts` exports:

- `AppEnv` — the fully-typed, defaulted shape of the app's configuration.
- `EnvError` — thrown when one or more `VITE_*` variables fail validation.
- `parseEnv(raw: Record<string, unknown>): AppEnv` — the pure, unit-testable
  core. It never touches `import.meta`; it takes a raw env-like object (in
  practice `import.meta.env`, but any plain object in tests) and either
  returns a valid `AppEnv` or throws `EnvError` listing every offending key.
- `env: AppEnv` — the single validated snapshot for the running app,
  computed once at module load as `parseEnv(import.meta.env)`.
- `assertEnv(): void` — an explicit fail-fast checkpoint. Call it from
  `main.tsx` before rendering to guarantee env validation has run (and
  surfaced any `EnvError`) before the app mounts.

Import `env` wherever a setting is needed:

```ts
import { env } from '@/config/env';

fetch(`${env.apiBaseUrl}/journeys`);
```

## Every variable is optional

Every `VITE_*` variable has a safe default computed inside `parseEnv`. An
empty `raw` object always parses successfully — this is required so CI and
a Cloudflare Pages build with **zero** `.env` configuration still succeed.
Dev-vs-prod defaults (for `VITE_APP_ENV` and `VITE_LOG_LEVEL`) are derived
from `raw.DEV` / `raw.MODE`, the same signal Vite injects into
`import.meta.env`.

| Var | Type | Default |
| --- | --- | --- |
| `VITE_APP_ENV` | `'development' \| 'staging' \| 'production'` | dev build → `'development'`, else `'production'` |
| `VITE_API_BASE_URL` | absolute URL or `/`-rooted path | `'/api'` |
| `VITE_LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | dev → `'debug'`, prod → `'warn'` |
| `VITE_FLAGS` | comma-separated list, `!` negates a flag | `''` |
| `VITE_APP_VERSION` | free-form string | `'dev'` |

See `.env.example` for the documented, copy-pasteable list.

## The `import.meta.env`-only-here rule

`import.meta.env` is a Vite-injected, untyped-by-default global. Referencing
it outside `src/config/env.ts` reintroduces the exact problem this module
exists to remove: scattered, unchecked, stringly-typed config reads. If you
find yourself reaching for `import.meta.env` anywhere else, add the value to
the `AppEnv` contract instead and read it via `env`.

`src/vite-env.d.ts` augments Vite's `ImportMetaEnv` with the five `VITE_*`
keys (all `readonly`, all optional strings) so `import.meta.env` itself
stays correctly typed at its one call site.

## Adding a new variable

1. Add the key to the table above and to `.env.example` (documented,
   commented out, showing its default).
2. Add the key to `ImportMetaEnv` in `src/vite-env.d.ts` as an optional
   `string`.
3. In `src/config/env.ts`:
   - Add the field to the `AppEnv` interface.
   - Add a schema entry in `parseEnv`'s Zod object (wrap in
     `z.preprocess(emptyToUndefined, ...)` so a blank value falls back to
     the default, and give validation failures a message that states the
     expected shape).
   - Map the parsed value onto the returned `AppEnv` object.
4. Add test cases to `src/config/env.test.ts`: the default, an explicit
   override, and (if the type can be invalid) a rejection case. Test
   `parseEnv` directly — never `import.meta`.
5. Update this document's table if the default or type is non-obvious.

## Fail-fast boot behaviour

`env` is computed once, at module load, as `parseEnv(import.meta.env)`. If
any `VITE_*` variable is present but invalid, `parseEnv` throws `EnvError`
with a message listing every offending key and its expected shape — the
module fails to load, and so does anything that imports it. In dev this
surfaces immediately as a Vite error overlay; in a built app it fails
before the app renders, rather than limping along with bad configuration.
`assertEnv()` gives call sites (e.g. `main.tsx`) an explicit place to invoke
this check and handle the resulting `EnvError` if desired.
