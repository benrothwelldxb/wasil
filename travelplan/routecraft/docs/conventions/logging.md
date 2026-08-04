# Logging

Scoped, level-filtered logging behind `@/lib/logger`. `console.*` is
referenced **nowhere else** in the codebase — every module that needs to
log imports `log` (or builds its own scope) from `src/lib/logger.ts`
instead.

## Why

Bare `console.*` calls have no on/off switch: they either spam production
consoles or get hand-wrapped in ad-hoc `if (import.meta.env.DEV)` checks
that drift file to file. Centralising logging behind one module gives every
call site a consistent level, a consistent scope prefix, and a single
place to later swap in a remote sink (error tracking, telemetry) without
touching call sites at all.

## The module

`src/lib/logger.ts` exports:

- `LogLevel` — `'debug' | 'info' | 'warn' | 'error' | 'silent'`, ordered
  low to high severity (`'silent'` is threshold-only; no entry is ever
  emitted at that level).
- `LogEntry` — the shape written to a sink: `{ level, scope, message,
  context?, timestamp }`.
- `LogSink` — `{ write(entry: LogEntry): void }`, the interface any
  destination for log entries implements.
- `Logger` — `debug` / `info` / `warn` / `error` methods taking a message
  and an optional context object, plus `child(scope)`.
- `createLogger(scope?: string): Logger` — builds a logger for `scope`
  (default `'app'`).
- `setSink(sink: LogSink): void` — replaces the active sink app-wide.
- `consoleSink: LogSink` — the default sink, and **the only place
  `console.*` may appear in the entire app**.
- `log: Logger` — the ready-made app-wide logger, `createLogger('app')`.

## Levels — when to use each

| Level | Use for |
| --- | --- |
| `debug` | Verbose, developer-only detail (cache hits, intermediate values). Noisy by design. |
| `info` | Notable, expected events worth a trace in normal operation. |
| `warn` | Something recoverable went wrong or a fallback path was taken — the kind of thing that's fine in production but worth surfacing. |
| `error` | A failure that needs attention. |
| `silent` | Not a call level — set `VITE_LOG_LEVEL=silent` to suppress all output. |

The active threshold is `env.logLevel` (see
[`docs/conventions/env.md`](./env.md)): dev defaults to `debug`, prod
defaults to `warn`. A call below the threshold is dropped before it ever
reaches the sink — no string formatting or sink work happens for
suppressed calls.

## Scoping

Every logger has a `:`-joined scope, starting from `'app'`:

```ts
import { log } from '@/lib/logger';

const logger = log.child('journey-search');
logger.warn('dropped invalid journeys from provider output', { count });
// scope: 'app:journey-search'
```

Prefer one `child()` scope per module/feature, created once at module
scope (as above), over re-deriving it per call.

## The single-sink rule and the ESLint contract

`eslint.config.js` sets `'no-console': 'error'` globally, with **one**
override:

```js
{
  files: ['src/lib/logger.ts'],
  rules: { 'no-console': 'off' },
}
```

That override is the only sanctioned way to call `console.*` — it lives
entirely inside `consoleSink.write`. Do not add inline
`// eslint-disable-next-line no-console` comments anywhere; if you find
yourself wanting one, you need `log`/`createLogger` instead, not another
exception carved into the rule.

Verify the invariant at any time with:

```sh
grep -rn "console\." src   # should show only src/lib/logger.ts
```

## Adding a remote sink later

`setSink` exists so a future telemetry/error-tracking sink can replace
`consoleSink` without touching any call site:

```ts
import { setSink } from '@/lib/logger';
import type { LogEntry, LogSink } from '@/lib/logger';

const remoteSink: LogSink = {
  write(entry: LogEntry) {
    if (entry.level === 'warn' || entry.level === 'error') {
      sendToTelemetry(entry);
    }
  },
};

setSink(remoteSink);
```

Call `setSink` once, early in app bootstrap (or compose it with
`consoleSink` if you want both destinations). Tests use the same seam to
capture entries in a plain array instead of hitting the console — see
`src/lib/logger.test.ts`.
