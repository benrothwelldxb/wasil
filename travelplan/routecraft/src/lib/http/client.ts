/**
 * Generic, typed HTTP client. A thin, provider-agnostic wrapper around
 * `fetch` that normalises every failure mode into an `HttpError` (see
 * `./errors.ts`) and gives callers base-URL joining, query serialisation,
 * JSON body handling, timeout/abort handling, and optional Zod response
 * validation for free.
 *
 * This module knows nothing about journeys, providers, or the domain — see
 * `docs/conventions/http.md` for how a future HTTP-backed `JourneyProvider`
 * is meant to sit on top of it.
 */
import type { ZodType } from 'zod';
import { env } from '@/config/env';
import { HttpError } from './errors';

/** Default request timeout, in milliseconds, when `timeoutMs` is not set. */
const DEFAULT_TIMEOUT_MS = 15000;

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+\-.]*:\/\//i;
const BODYLESS_METHODS = new Set(['GET', 'DELETE']);

export interface HttpClientOptions {
  /** Absolute URL or root-relative path every request is joined against. */
  baseUrl: string;
  /** Headers merged onto every request; per-request `headers` take precedence. */
  defaultHeaders?: Record<string, string>;
  /** Milliseconds before a request is aborted with `kind: 'timeout'`. Default `15000`. */
  timeoutMs?: number;
  /** Override for `fetch`, primarily for testing. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Called with every `HttpError` immediately before it is thrown. */
  onError?: (err: HttpError) => void;
}

export interface RequestOptions<T> {
  method?: string;
  /** Appended to the URL as a query string. `undefined` values are skipped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON-stringified and sent as the request body. Ignored for GET/DELETE. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** When set, the parsed JSON response is validated through this schema. */
  schema?: ZodType<T>;
}

export interface HttpClient {
  request<T = unknown>(path: string, opts?: RequestOptions<T>): Promise<T>;
  get<T = unknown>(path: string, opts?: Omit<RequestOptions<T>, 'method' | 'body'>): Promise<T>;
  post<T = unknown>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions<T>, 'method' | 'body'>,
  ): Promise<T>;
  put<T = unknown>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions<T>, 'method' | 'body'>,
  ): Promise<T>;
  patch<T = unknown>(
    path: string,
    body?: unknown,
    opts?: Omit<RequestOptions<T>, 'method' | 'body'>,
  ): Promise<T>;
  delete<T = unknown>(path: string, opts?: Omit<RequestOptions<T>, 'method' | 'body'>): Promise<T>;
}

/** `HttpClientOptions` with every optional field defaulted/resolved once. */
interface ResolvedClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  onError?: (err: HttpError) => void;
}

/**
 * Joins `baseUrl` and `path` with exactly one `/` between them. An absolute
 * `path` (`http://`, `https://`, ...) is returned unchanged.
 */
function joinUrl(baseUrl: string, path: string): string {
  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

/** Appends `query` to `url`, skipping `undefined` values and stringifying the rest. */
function appendQuery(url: string, query: RequestOptions<unknown>['query']): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  if (!qs) return url;
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

/** Merges default and per-request headers into a single `Headers` instance. */
function buildHeaders(
  defaultHeaders: Record<string, string> | undefined,
  requestHeaders: Record<string, string> | undefined,
): Headers {
  const headers = new Headers(defaultHeaders);
  if (requestHeaders) {
    for (const [key, value] of Object.entries(requestHeaders)) {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * A `signal` that aborts when either `timeoutMs` elapses or `callerSignal`
 * aborts, plus enough state to tell the two apart afterwards. Uses
 * `AbortSignal.any` when available, falling back to manual listener wiring.
 */
interface CombinedSignal {
  signal: AbortSignal;
  /** Clears the internal timeout timer. Must be called on every exit path. */
  cleanup: () => void;
  /** True once the internal timeout (as opposed to the caller) has fired. */
  didTimeOut: () => boolean;
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function createTimeoutSignal(timeoutMs: number, callerSignal: AbortSignal | undefined): CombinedSignal {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);

  const signals = callerSignal ? [timeoutController.signal, callerSignal] : [timeoutController.signal];

  return {
    signal: combineSignals(signals),
    cleanup: () => clearTimeout(timer),
    didTimeOut: () => timeoutController.signal.aborted,
  };
}

/** True for `DOMException`/`Error` values `fetch` rejects with on abort. */
function isAbortLikeError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  return err instanceof Error && err.name === 'AbortError';
}

/** Turns a rejected `fetch()` call into a normalised `HttpError`. */
function toRequestFailure(args: {
  rawError: unknown;
  url: string;
  callerSignal: AbortSignal | undefined;
  didTimeOut: () => boolean;
}): HttpError {
  const { rawError, url, callerSignal, didTimeOut } = args;

  if (isAbortLikeError(rawError)) {
    // A caller-initiated abort takes precedence: the caller explicitly
    // cancelled, regardless of whether the timeout also happened to fire.
    if (callerSignal?.aborted) {
      return new HttpError({
        kind: 'abort',
        message: `Request to ${url} was aborted by the caller.`,
        url,
        cause: rawError,
      });
    }
    if (didTimeOut()) {
      return new HttpError({
        kind: 'timeout',
        message: `Request to ${url} timed out.`,
        url,
        cause: rawError,
      });
    }
    // Aborted for an unattributable reason (e.g. a manually combined
    // signal firing outside our own timeout/caller pair). Treat as abort.
    return new HttpError({
      kind: 'abort',
      message: `Request to ${url} was aborted.`,
      url,
      cause: rawError,
    });
  }

  return new HttpError({
    kind: 'network',
    message: `Network error while requesting ${url}.`,
    url,
    cause: rawError,
  });
}

/** Best-effort response body read for a non-2xx response. Never throws. */
async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

async function performRequest<T>(
  client: ResolvedClientOptions,
  path: string,
  opts: RequestOptions<T>,
): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const url = appendQuery(joinUrl(client.baseUrl, path), opts.query);
  const headers = buildHeaders(client.defaultHeaders, opts.headers);

  let requestBody: string | undefined;
  if (opts.body !== undefined && !BODYLESS_METHODS.has(method)) {
    requestBody = JSON.stringify(opts.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  const { signal, cleanup, didTimeOut } = createTimeoutSignal(client.timeoutMs, opts.signal);

  let response: Response;
  try {
    response = await client.fetchImpl(url, {
      method,
      headers,
      body: requestBody,
      signal,
    });
  } catch (rawError) {
    cleanup();
    const err = toRequestFailure({ rawError, url, callerSignal: opts.signal, didTimeOut });
    client.onError?.(err);
    throw err;
  }
  cleanup();

  if (!response.ok) {
    const body = await readErrorBody(response);
    const err = new HttpError({
      kind: 'http',
      message: `Request to ${url} failed with status ${response.status}.`,
      url,
      status: response.status,
      body,
    });
    client.onError?.(err);
    throw err;
  }

  let data: unknown;
  if (response.status === 204) {
    data = undefined;
  } else {
    const text = await response.text();
    if (text.length === 0) {
      data = undefined;
    } else {
      try {
        data = JSON.parse(text);
      } catch (rawError) {
        const err = new HttpError({
          kind: 'parse',
          message: `Response from ${url} was not valid JSON.`,
          url,
          status: response.status,
          cause: rawError,
        });
        client.onError?.(err);
        throw err;
      }
    }
  }

  if (opts.schema) {
    const result = opts.schema.safeParse(data);
    if (!result.success) {
      const err = new HttpError({
        kind: 'parse',
        message: `Response from ${url} failed schema validation.`,
        url,
        status: response.status,
        body: data,
        cause: result.error,
      });
      client.onError?.(err);
      throw err;
    }
    return result.data;
  }

  return data as T;
}

/** Builds a client bound to `opts.baseUrl`. See `docs/conventions/http.md` for the contract. */
export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const client: ResolvedClientOptions = {
    baseUrl: opts.baseUrl,
    defaultHeaders: opts.defaultHeaders,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: opts.fetchImpl ?? fetch,
    onError: opts.onError,
  };

  function request<T = unknown>(path: string, requestOpts: RequestOptions<T> = {}): Promise<T> {
    return performRequest(client, path, requestOpts);
  }

  return {
    request,
    get<T = unknown>(path: string, requestOpts?: Omit<RequestOptions<T>, 'method' | 'body'>): Promise<T> {
      return request<T>(path, { ...requestOpts, method: 'GET' });
    },
    post<T = unknown>(
      path: string,
      body?: unknown,
      requestOpts?: Omit<RequestOptions<T>, 'method' | 'body'>,
    ): Promise<T> {
      return request<T>(path, { ...requestOpts, method: 'POST', body });
    },
    put<T = unknown>(
      path: string,
      body?: unknown,
      requestOpts?: Omit<RequestOptions<T>, 'method' | 'body'>,
    ): Promise<T> {
      return request<T>(path, { ...requestOpts, method: 'PUT', body });
    },
    patch<T = unknown>(
      path: string,
      body?: unknown,
      requestOpts?: Omit<RequestOptions<T>, 'method' | 'body'>,
    ): Promise<T> {
      return request<T>(path, { ...requestOpts, method: 'PATCH', body });
    },
    delete<T = unknown>(path: string, requestOpts?: Omit<RequestOptions<T>, 'method' | 'body'>): Promise<T> {
      return request<T>(path, { ...requestOpts, method: 'DELETE' });
    },
  };
}

let defaultClient: HttpClient | undefined;

/**
 * Lazy, module-level singleton `HttpClient` bound to `env.apiBaseUrl`.
 * Constructed on first call so importing this module never touches `env`
 * (and therefore `import.meta.env`) as a side effect.
 */
export function getDefaultHttpClient(): HttpClient {
  if (!defaultClient) {
    defaultClient = createHttpClient({ baseUrl: env.apiBaseUrl });
  }
  return defaultClient;
}
