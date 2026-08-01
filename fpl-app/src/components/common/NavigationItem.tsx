import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavigationItemProps {
  /** Destination path. */
  to: string;
  /** Visible label. */
  label: string;
  /** Leading icon. */
  icon: LucideIcon;
  /** Match the path exactly. */
  end?: boolean;
  /** Called after navigation (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
  /** Visual density — `sidebar` for stacked nav, `inline` for the header. */
  variant?: "sidebar" | "inline";
  className?: string;
}

/**
 * A single navigation link with active-state styling. Built on React Router's
 * `NavLink` so the active state is derived from the current route.
 */
export function NavigationItem({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
  variant = "sidebar",
  className,
}: NavigationItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "sidebar" ? "px-3 py-2" : "px-3 py-2",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          className,
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}
