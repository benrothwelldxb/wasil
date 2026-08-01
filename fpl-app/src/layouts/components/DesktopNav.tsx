import { NavigationItem } from "@/components/common";
import { PRIMARY_NAV } from "@/routes/navigation";
import { cn } from "@/lib/utils";

export interface DesktopNavProps {
  className?: string;
}

/**
 * Horizontal primary navigation shown in the header on `md`+ viewports.
 */
export function DesktopNav({ className }: DesktopNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn("hidden items-center gap-1 md:flex", className)}
    >
      {PRIMARY_NAV.map((item) => (
        <NavigationItem
          key={item.id}
          to={item.path}
          label={item.label}
          icon={item.icon}
          end={item.end}
          variant="inline"
        />
      ))}
    </nav>
  );
}
