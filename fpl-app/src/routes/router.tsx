import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout, RootLayout } from "@/layouts";
import { RouteErrorPage } from "@/app/pages";
import { ROUTES } from "./paths";

/**
 * Route pages are lazy-loaded so each becomes its own chunk — the initial
 * bundle only carries the shell. The `RootLayout` Suspense boundary shows a
 * spinner while a page chunk loads. `RouteErrorPage` stays eager so the error
 * boundary never depends on a lazy import.
 */
const DashboardPage = lazy(() =>
  import("@/app/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const PlayersPage = lazy(() =>
  import("@/app/pages/PlayersPage").then((m) => ({ default: m.PlayersPage })),
);
const ScoringPage = lazy(() =>
  import("@/app/pages/ScoringPage").then((m) => ({ default: m.ScoringPage })),
);
const PredictionsPage = lazy(() =>
  import("@/app/pages/PredictionsPage").then((m) => ({
    default: m.PredictionsPage,
  })),
);
const OptimiserPage = lazy(() =>
  import("@/app/pages/OptimiserPage").then((m) => ({
    default: m.OptimiserPage,
  })),
);
const LineupPage = lazy(() =>
  import("@/app/pages/LineupPage").then((m) => ({ default: m.LineupPage })),
);
const LivePage = lazy(() =>
  import("@/app/pages/LivePage").then((m) => ({ default: m.LivePage })),
);
const TransfersPage = lazy(() =>
  import("@/app/pages/TransfersPage").then((m) => ({
    default: m.TransfersPage,
  })),
);
const PricesPage = lazy(() =>
  import("@/app/pages/PricesPage").then((m) => ({ default: m.PricesPage })),
);
const SquadPage = lazy(() =>
  import("@/app/pages/SquadPage").then((m) => ({ default: m.SquadPage })),
);
const FixturesPage = lazy(() =>
  import("@/app/pages/FixturesPage").then((m) => ({ default: m.FixturesPage })),
);
const PreferencesPage = lazy(() =>
  import("@/app/pages/PreferencesPage").then((m) => ({
    default: m.PreferencesPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("@/app/pages/OnboardingPage").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/app/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const DebugPage = lazy(() =>
  import("@/app/pages/DebugPage").then((m) => ({ default: m.DebugPage })),
);
const NotFoundPage = lazy(() =>
  import("@/app/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

/**
 * Application router.
 *
 * Uses nested layouts: `RootLayout` (scroll restoration + suspense) wraps
 * `AppLayout` (the visual shell), whose `<Outlet />` renders the page for the
 * active route. A catch-all route renders the 404 page inside the shell.
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: ROUTES.players, element: <PlayersPage /> },
          { path: ROUTES.ratings, element: <ScoringPage /> },
          { path: ROUTES.predictions, element: <PredictionsPage /> },
          { path: ROUTES.optimiser, element: <OptimiserPage /> },
          { path: ROUTES.lineup, element: <LineupPage /> },
          { path: ROUTES.live, element: <LivePage /> },
          { path: ROUTES.transfers, element: <TransfersPage /> },
          { path: ROUTES.prices, element: <PricesPage /> },
          { path: ROUTES.squad, element: <SquadPage /> },
          { path: ROUTES.fixtures, element: <FixturesPage /> },
          {
            path: ROUTES.team,
            element: <Navigate to={ROUTES.lineup} replace />,
          },
          {
            path: ROUTES.analyse,
            element: <Navigate to={ROUTES.ratings} replace />,
          },
          { path: ROUTES.preferences, element: <PreferencesPage /> },
          { path: ROUTES.onboarding, element: <OnboardingPage /> },
          { path: ROUTES.settings, element: <SettingsPage /> },
          { path: ROUTES.debug, element: <DebugPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
