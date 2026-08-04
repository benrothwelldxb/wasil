# HTTP client

Phase One convention for the generic, typed `fetch` wrapper that any future
API-backed data provider is built on top of. It lives at `@/lib/http` and
knows nothing about journeys, providers, or any other domain concept — it
normalises HTTP mechanics only.

## The module

`src/lib/http/` exports (re-exported from `src/lib/http/index.ts`):

- `createHttpClient(opts: HttpClientOptions): HttpClient` — builds a client
  bound to a base URL.
- `getDefaultHttpClient(): HttpClient` — a lazy, module-level singleton
  built from `env.apiBaseUrl` (see `@/config/env`, [env.md](./env.md)). Lazy
  so importing the module never touches `import.meta.env` as a side effect.
- `HttpClient` — `request`, plus `get`/`post`/`put`/`patch`/`delete`
  convenience methods.
- `HttpError` / `isHttpError` — the single error type every call can throw.

```ts
import { getDefaultHttpClient } from '@/lib/http';

const http = getDefaultHttpClient();
const journey = await http.get<Journey>(`/journeys/${id}`, { schema: journeySchema });
```

## `HttpClientOptions`

| Option | Default | Notes |
| --- | --- | --- |
| `baseUrl` | required | Absolute URL or root-relative path every request is joined against. |
| `defaultHeaders` | `{}` | Merged onto every request; per-request `headers` win on conflict. |
| `timeoutMs` | `15000` | Milliseconds before a request is aborted and rejected with `kind: 'timeout'`. |
| `fetchImpl` | global `fetch` | Override point for testing. |
| `onError` | — | Called with the `HttpError` immediately before every throw — the wiring seam for the logger (`@/lib/logger`), deliberately not imported here so this module stays independent of it. |

## `RequestOptions<T>`

| Option | Behaviour |
| --- | --- |
| `method` | Defaults to `'GET'` on `request()`; set implicitly by `get`/`post`/`put`/`patch`/`delete`. |
| `query` | Appended as a query string. `undefined` values are skipped; `number`/`boolean` are coerced with `String(...)`. |
| `body` | JSON-stringified with `content-type: application/json` (unless the caller already set that header). Ignored for `GET`/`DELETE`, which never send a body. |
| `headers` | Merged over `defaultHeaders` for this request only. |
| `signal` | Caller-supplied `AbortSignal`, combined with the client's internal timeout signal. |
| `schema` | A `zod` `ZodType<T>`. When set, the parsed JSON response is validated through it and the *validated* value is returned. |

## Base-URL joining

`baseUrl` and `path` are joined with exactly one `/` between them,
regardless of whether either side already has one:

```
https://api.test   + /journeys  -> https://api.test/journeys
https://api.test/  + /journeys  -> https://api.test/journeys
https://api.test   + journeys   -> https://api.test/journeys
https://api.test/v1/ + /journeys -> https://api.test/v1/journeys
```

A `path` that is itself an absolute URL (`http://` / `https://`) is used
as-is; `baseUrl` is ignored for that call.

## Error taxonomy

Every failure — thrown by `request()` and every convenience method — is an
`HttpError` (`src/lib/http/errors.ts`), never a raw `TypeError`,
`SyntaxError`, or `DOMException`:

```ts
export type HttpErrorKind = 'http' | 'network' | 'timeout' | 'abort' | 'parse';

export class HttpError extends Error {
  kind: HttpErrorKind;
  status?: number;   // set when a response was actually received
  url: string;        // the fully-resolved request URL
  body?: unknown;      // best-effort parsed response body, for kind 'http'
  cause?: unknown;     // the underlying error, when there is one
}
```

| `kind` | When | `status` | `body` |
| --- | --- | --- | --- |
| `'http'` | Response received, status not 2xx | set | best-effort parse: JSON if `content-type` says so, else text, else `undefined` — reading the body never itself throws |
| `'network'` | `fetch` rejected for a reason other than abort (DNS, connection refused, CORS, ...) | unset | — |
| `'timeout'` | The client's internal timeout (`timeoutMs`, default `15000`) fired before a response arrived | unset | — |
| `'abort'` | The caller's `AbortSignal` aborted the request | unset | — |
| `'parse'` | The response body wasn't valid JSON, or failed the caller's `schema` | set if a response was received | set to the raw parsed value for schema failures |

`onError` (if provided) is called with the `HttpError` immediately before
every throw, so a caller can wire logging without this module importing
`@/lib/logger` directly — see [logging.md](./logging.md) for why that
import direction is deliberately not there.

### Timeout vs. abort

The client always runs its own `AbortController` for `timeoutMs`. When the
caller also passes a `signal`, the two are combined with `AbortSignal.any`
(falling back to manual listener wiring on runtimes without it) so either
one can cancel the underlying `fetch`. Which `kind` comes out is decided by
which signal actually fired:

- Caller's `signal` aborted → `kind: 'abort'` (even if the timeout also
  happened to elapse around the same time — an explicit cancel always wins).
- Only the internal timeout fired → `kind: 'timeout'`.

## The provider seam

`@/lib/http` is deliberately generic — it has no knowledge of `Journey`,
`SearchCriteria`, or any other domain type, and this task does not touch
`src/data/provider/*`. The seam is architectural, not yet implemented:

A future `HttpJourneyProvider` would implement the existing `JourneyProvider`
interface (`src/data/provider/JourneyProvider.ts`) on top of
`getDefaultHttpClient()` — calling `get`/`post` with the appropriate
`schema` for each endpoint and translating `HttpError` into the existing
`ProviderError` taxonomy (`src/data/provider/errors.ts`) — and would be
swapped in via `getJourneyProvider()` in
`src/data/provider/provider-registry.ts`, gated by an `httpProvider` feature
flag. Phase One deliberately does not build `HttpJourneyProvider`, its
endpoints, or any travel-domain types on top of this client — only the
client itself.
