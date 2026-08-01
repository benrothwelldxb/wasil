import { Outlet, useLocation } from "react-router-dom";
import { OnboardingModal } from "@/features/preferences/components/OnboardingModal";
import { BottomTabBar, Footer, Header, OfflineBanner } from "./components";

/**
 * The main application shell: a skip link, an offline banner, a sticky header
 * with navigation, the routed main content area, and a footer. Nested route
 * content renders through the `<Outlet />` and gently fades in on navigation.
 */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <OfflineBanner />
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 pb-16 outline-none md:pb-0"
      >
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
      <Footer />
      <BottomTabBar />
      <OnboardingModal />
    </div>
  );
}
