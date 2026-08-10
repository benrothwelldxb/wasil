import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';
import { BottomNavigation } from './BottomNavigation';
import { RequireOnboarded } from '@/app/RequireOnboarded';
import { DemoBanner } from './DemoBanner';

/** Layout for the primary tabbed screens (with persistent bottom navigation). */
export function AppLayout() {
  return (
    <AppShell bottomBar={<BottomNavigation />}>
      <RequireOnboarded>
        <DemoBanner />
        <Outlet />
      </RequireOnboarded>
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
