/**
 * Public surface of the generic HTTP client. See `docs/conventions/http.md`
 * for the full contract.
 */
export type { HttpClient, HttpClientOptions, RequestOptions } from './client';
export { createHttpClient, getDefaultHttpClient } from './client';

export type { HttpErrorInit, HttpErrorKind } from './errors';
export { HttpError, isHttpError } from './errors';
