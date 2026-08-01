import { Link } from "react-router-dom";
import { AppLogo, ThemeToggle } from "@/components/common";
import { ROUTES } from "@/routes/paths";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";

/**
 * The application header: brand, primary navigation (desktop), theme toggle,
 * and the mobile navigation trigger. Sticky and translucent so content
 * scrolls beneath it.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link
            to={ROUTES.dashboard}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AppLogo />
          </Link>
        </div>

        <DesktopNav className="ml-6" />

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
