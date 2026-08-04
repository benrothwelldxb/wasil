import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/shared/AppShell';
import { NotFoundPage } from '@/components/shared/StateViews';
import { ResultsSkeleton } from '@/features/results/ResultsSkeleton';
import { LandingPage } from '@/features/search/LandingPage';

const ResultsPage = lazy(() =>
  import('@/features/results/ResultsPage').then((m) => ({ default: m.ResultsPage })),
);
const JourneyDetailPage = lazy(() =>
  import('@/features/journey/JourneyDetailPage').then((m) => ({ default: m.JourneyDetailPage })),
);

function RouteFallback() {
  return (
    <div className="container py-10">
      <ResultsSkeleton count={3} />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        path: '/results',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <ResultsPage />
          </Suspense>
        ),
      },
      {
        path: '/journeys/:journeyId',
        element: (
          <Suspense fallback={<RouteFallback />}>
            <JourneyDetailPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
