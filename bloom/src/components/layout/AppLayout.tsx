import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';
import { BottomNavigation } from './BottomNavigation';

/** Layout for the primary tabbed screens (with persistent bottom navigation). */
export function AppLayout() {
  return (
    <AppShell bottomBar={<BottomNavigation />}>
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
