import { createBrowserRouter } from "react-router-dom";
import { AppLayout, RootLayout } from "@/layouts";
import {
  AnalysePage,
  DashboardPage,
  DebugPage,
  FixturesPage,
  NotFoundPage,
  OnboardingPage,
  PlayersPage,
  PreferencesPage,
  RouteErrorPage,
  SettingsPage,
  SquadPage,
  TeamPage,
} from "@/app/pages";
import { ROUTES } from "./paths";

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
          { path: ROUTES.squad, element: <SquadPage /> },
          { path: ROUTES.fixtures, element: <FixturesPage /> },
          { path: ROUTES.team, element: <TeamPage /> },
          { path: ROUTES.analyse, element: <AnalysePage /> },
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
