# Testing

Vitest + Testing Library + msw (network) + vitest-axe (a11y), jsdom environment.

## Rendering components

Use `renderWithProviders` from `@/test/render` — it mounts the component inside
the app provider stack (a fresh `QueryClient` with retries off, `TooltipProvider`)
on a memory router:

```ts
import { renderWithProviders, screen } from '@/test/render';

const { user } = renderWithProviders(<MyComponent />, {
  route: '/items/42',      // initial URL
  path: '/items/:id',      // route pattern (to exercise params)
});
```

It re-exports the Testing Library API and a configured `userEvent`, so import
everything from `@/test/render`.

## Accessibility

Assert no violations with the helper (no global matcher, no `any`):

```ts
import { expectNoA11yViolations } from '@/test/a11y';
const { container } = renderWithProviders(<MyComponent />);
await expectNoA11yViolations(container);
```

`color-contrast` is disabled by default (jsdom has no layout/canvas engine).

## Network mocking (msw)

The shared server (`@/test/msw/server`) is **not** started globally — self-contained
unit tests run their own `setupServer` without a double-interceptor conflict.
For integration tests that want the shared server, opt in per file:

```ts
import { server } from '@/test/msw/server';
import { http, HttpResponse } from 'msw';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('...', async () => {
  server.use(http.get('*/things', () => HttpResponse.json([])));
  // ...
});
```

## jsdom shims

`src/test/setup.ts` provides `matchMedia`, `ResizeObserver`, `IntersectionObserver`,
`scrollIntoView`, and pointer-capture stubs required by Radix primitives and
framer-motion. Add new global shims there, not per test.

## Coverage

Thresholds (80% lines/functions/statements, 70% branches) are enforced on the
logic + platform layers: `src/domain`, `src/data/synthetic`, `src/lib`,
`src/config`, `src/stores`. Every new module in those directories ships tests
meeting the thresholds.

Presentational code (`features/*`, `components/shared/*`, `components/ui/*`) gets
behaviour + a11y tests (see `AppShell`, `button`, `dialog`, `loading`,
`ErrorBoundary`) but is not held to a line-coverage percentage. Broadening UI and
hook coverage is a **Phase Two** item.

Run: `npm run test:ci` (`vitest run --coverage`).
