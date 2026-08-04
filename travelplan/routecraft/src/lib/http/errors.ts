/**
 * Normalised error taxonomy for the generic HTTP client (`@/lib/http`).
 *
 * Every failure mode the client can produce — non-2xx responses, network
 * failures, timeouts, caller-initiated aborts, and response-parsing/schema
 * failures — surfaces as an `HttpError` carrying a machine-readable `kind`.
 * No raw `TypeError`/`SyntaxError`/`DOMException` ever escapes the client;
 * see `docs/conventions/http.md` for the full contract.
 */

/**
 * - `'http'` — the request completed but the response status was not 2xx.
 * - `'network'` — `fetch` itself rejected for a reason other than abort
 *   (DNS failure, connection refused, CORS, etc).
 * - `'timeout'` — the client's internal timeout fired before a response
 *   arrived.
 * - `'abort'` — the caller-supplied `AbortSignal` aborted the request.
 * - `'parse'` — the response body could not be parsed as JSON, or failed
 *   the caller-supplied Zod `schema`.
 */
export type HttpErrorKind = 'http' | 'network' | 'timeout' | 'abort' | 'parse';

export interface HttpErrorInit {
  kind: HttpErrorKind;
  message: string;
  /** The fully-resolved request URL (after base-URL join and query append). */
  url: string;
  /** HTTP status code, when a response was actually received. */
  status?: number;
  /** Best-effort parsed response body, when a response was actually received. */
  body?: unknown;
  /** The underlying error/rejection this `HttpError` was derived from, if any. */
  cause?: unknown;
}

/** The single error type every `@/lib/http` client call can throw. */
export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly url: string;
  readonly body?: unknown;
  override cause?: unknown;

  constructor(init: HttpErrorInit) {
    super(init.message);
    this.name = 'HttpError';
    this.kind = init.kind;
    this.status = init.status;
    this.url = init.url;
    this.body = init.body;
    this.cause = init.cause;
    // Preserve prototype chain when targeting ES5-style transpilation.
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/** Type guard for narrowing an unknown `catch` value to `HttpError`. */
export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
