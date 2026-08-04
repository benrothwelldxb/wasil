import type { RequestHandler } from 'msw';

/**
 * Default request handlers for the shared msw server. Empty by default —
 * integration tests register handlers per test with `server.use(...)`.
 */
export const handlers: RequestHandler[] = [];
