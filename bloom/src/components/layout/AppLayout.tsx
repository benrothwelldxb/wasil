import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';
import { BottomNavigation } from './BottomNavigation';

/** Layout for the primary tabbed screens (with persistent bottom navigation). */
export function AppLayout() {
  return (
    <AppShell bottomBar={<BottomNavigation />}>
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Outlet />
    </AppShell>
  );
}

/** Layout for focused, full-screen flows (check-in, onboarding) — no bottom nav. */
export function FocusLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
