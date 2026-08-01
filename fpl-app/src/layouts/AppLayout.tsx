import { Outlet } from "react-router-dom";
import { Footer, Header } from "./components";

/**
 * The main application shell: a sticky header with navigation, the routed
 * main content area, and a footer. Nested route content renders through the
 * `<Outlet />`.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
