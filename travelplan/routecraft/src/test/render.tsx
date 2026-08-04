import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

/** A QueryClient tuned for tests: no retries, no caching between tests. */
export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial URL to load (default '/'). */
  route?: string;
  /** Route pattern the `ui` is mounted at (default '/'); use to exercise params. */
  path?: string;
  queryClient?: QueryClient;
}

/**
 * Renders `ui` inside the app's provider stack (QueryClient + Tooltip) on a
 * memory router, mirroring `AppProviders` semantics without app singletons.
 * Returns the Testing Library result plus a ready `user` and the `queryClient`.
 */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { route = '/', path = '/', queryClient = makeTestQueryClient(), ...rtlOptions } = options;

  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [route] });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
    rtlOptions,
  );

  return { user: userEvent.setup(), queryClient, ...result };
}

// Re-export the Testing Library surface plus a configured userEvent so tests
// import everything from one place.
export * from '@testing-library/react';
export { userEvent };
