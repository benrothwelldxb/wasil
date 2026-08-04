import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/components/shared/AppShell';
import { NotFoundPage } from '@/components/shared/StateViews';
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

function makeRouter(initialEntry: string) {
  return createMemoryRouter(
    [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: '/', element: <div>home</div>, errorElement: <RouteErrorBoundary /> },
          { path: '/boom', element: <Boom />, errorElement: <RouteErrorBoundary /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
}

describe('router wiring', () => {
  it('renders the NotFound page for an unknown path', () => {
    render(<RouterProvider router={makeRouter('/does-not-exist')} />);
    expect(screen.getByText(/off the map/i)).toBeInTheDocument();
  });

  it('shows the error fallback but keeps the shell when a route throws', () => {
    // React logs the caught error; silence via property-access spy (no console call).
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<RouterProvider router={makeRouter('/boom')} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Shell landmarks survive the route-level crash.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    spy.mockRestore();
  });
});
