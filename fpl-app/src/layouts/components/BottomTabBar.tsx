import { NavLink } from "react-router-dom";
import { ClipboardList, Home, Table2, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROUTES } from "@/routes/paths";
import { cn } from "@/lib/utils";

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: ROUTES.dashboard, label: "Home", icon: Home, end: true },
  { to: ROUTES.optimiser, label: "Pick Team", icon: Wand2 },
  { to: ROUTES.lineup, label: "Lineup", icon: ClipboardList },
  { to: ROUTES.players, label: "Players", icon: Table2 },
];

/**
 * A thumb-reachable bottom tab bar exposing the four most-used destinations on
 * mobile. The full nav stays available in the drawer for the deeper surfaces.
 */
export function BottomTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <tab.icon className="h-5 w-5" aria-hidden />
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
