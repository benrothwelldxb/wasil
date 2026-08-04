import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shared/AppShell';
import { NotFoundPage } from '@/components/shared/StateViews';
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary';
import { Loadable } from '@/components/shared/loading';
import { ResultsSkeleton } from '@/features/results/ResultsSkeleton';
import { LandingPage } from '@/features/search/LandingPage';

const ResultsPage = lazy(() =>
  import('@/features/results/ResultsPage').then((m) => ({ default: m.ResultsPage })),
);
const JourneyDetailPage = lazy(() =>
  import('@/features/journey/JourneyDetailPage').then((m) => ({ default: m.JourneyDetailPage })),
);

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    // Layout-level catch-all: if the shell itself fails, still show a fallback.
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/', element: <LandingPage />, errorElement: <RouteErrorBoundary /> },
      {
        path: '/results',
        // Keep the results skeleton as the explicit loading UX.
        element: (
          <Loadable
            fallback={
              <div className="container py-10">
                <ResultsSkeleton count={3} />
              </div>
            }
          >
            <ResultsPage />
          </Loadable>
        ),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: '/journeys/:journeyId',
        element: (
          <Loadable>
            <JourneyDetailPage />
          </Loadable>
        ),
        errorElement: <RouteErrorBoundary />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
