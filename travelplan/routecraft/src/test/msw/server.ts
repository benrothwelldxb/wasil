import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Shared msw server for integration tests that need network mocking. Opt in per
 * test file:
 *
 *   import { server } from '@/test/msw/server';
 *   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 *
 * It is intentionally NOT started globally in `setup.ts` so that self-contained
 * unit tests (e.g. the HTTP client) can run their own server without a
 * double-interceptor conflict. See docs/conventions/testing.md.
 */
export const server = setupServer(...handlers);
