# Feature flags

A typed flag registry, resolved once into a frozen boolean snapshot at
module load. Read flags via `isEnabled`, the `useFlag` hook, or the `<Flag>`
component — never by reading `FLAG_REGISTRY` or `env.rawFlags` directly.

## The module

`src/config/flags.ts` exports:

- `FLAG_REGISTRY` — the source of truth: every flag's per-environment
  default and a human-readable `description`.
- `FlagName` — `keyof typeof FLAG_REGISTRY`, the type-safe set of valid
  flag names.
- `resolveFlags(input): Record<FlagName, boolean>` — the pure,
  unit-testable core. Takes `{ defaults, rawEnvFlags, localOverride, appEnv }`
  and layers registry defaults → env string → localStorage override. Touches
  no globals, so tests call it directly with fabricated inputs.
- `flags: Readonly<Record<FlagName, boolean>>` — the frozen snapshot for the
  running app, computed once as `resolveFlags({ ...real inputs })`.
- `isEnabled(name: FlagName): boolean` — reads `flags`.

`src/hooks/use-flag.ts` exports `useFlag(name: FlagName): boolean`, a thin
hook-shaped wrapper over `isEnabled`. `src/components/shared/Flag.tsx`
exports `<Flag name fallback?>` for gating JSX:

```tsx
import { Flag } from '@/components/shared/Flag';
import { useFlag } from '@/hooks/use-flag';

<Flag name="debugPanel" fallback={null}>
  <DebugPanel />
</Flag>;

const showDevtools = useFlag('queryDevtools');
```

## Resolution precedence

Highest precedence first, computed once at module load:

1. **localStorage override — dev only.** Only read when `env.isDev` is
   `true`; ignored entirely otherwise (so it can never leak into a staging
   or production build). Key: `routecraft:flags`. Same comma/`!` syntax as
   `VITE_FLAGS` (below).
2. **`env.rawFlags`** — the `VITE_FLAGS` env string.
3. **`FLAG_REGISTRY[name].default[env.appEnv]`** — the registry default for
   the current environment.

Each layer only overrides the flags it names; anything unmentioned falls
through to the next layer. Both the env string and the localStorage override
use the same parser: comma-separated names, optional whitespace, `name`
enables, `!name` disables. An unmentioned or unknown name is left alone; an
**unknown** name is ignored and reported once via `log.warn('unknown
feature flag', { name })` per resolution pass.

## Adding a flag

Touch only `src/config/flags.ts`:

1. Add a key to `FLAG_REGISTRY` with a `default` for all three environments
   (`development`, `staging`, `production`) and a one-line `description`.
2. That's it — `FlagName`, `flags`, `isEnabled`, `useFlag`, and `<Flag>` all
   pick it up automatically through the type.
3. Add resolution-default test cases to `src/config/flags.test.ts` if the
   new flag has interesting per-environment behaviour.

Do not read `env.rawFlags` or `FLAG_REGISTRY` directly from feature code —
go through `isEnabled` / `useFlag` / `<Flag>` so every read observes the
same resolved snapshot.

## Dev-only QA recipe

In a development build, override any flag from the browser console without
touching `.env` or rebuilding:

```js
localStorage.setItem('routecraft:flags', 'queryDevtools,!syntheticLatency');
// reload the page — the new snapshot is resolved on module load
```

Clear it to go back to the env-string/default resolution:

```js
localStorage.removeItem('routecraft:flags');
```

This override is read only when `env.isDev` is `true`; it has no effect in
staging or production builds, by design.

## Lifecycle

Flags are temporary scaffolding, not permanent configuration. Every entry in
`FLAG_REGISTRY` must have:

- **An owner** — the person/team who added it and is responsible for
  removing it.
- **A removal condition** — the specific event that makes the flag
  unnecessary (e.g. "remove once the HTTP journey provider ships in Phase
  Two and the synthetic provider is retired," or "remove once the debug
  panel redesign is validated in staging").

When a flag's removal condition is met: delete its entry from
`FLAG_REGISTRY`, delete the `<Flag name="...">` / `useFlag('...')` call
sites (keeping whichever branch is now permanent), and remove it from
`.env.example` / any docs that mention it. Do not leave a flag permanently
wired to `true` or `false` as a substitute for deleting it — a stale flag is
dead code wearing a config costume.
