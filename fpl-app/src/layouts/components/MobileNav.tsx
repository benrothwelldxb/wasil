import { Menu } from "lucide-react";
import { AppLogo, NavigationItem } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAppStore } from "@/store";
import { PRIMARY_NAV } from "@/routes/navigation";

/**
 * Slide-out navigation drawer for small screens. Open state is driven by the
 * app store so it can be controlled from anywhere, and it auto-closes on
 * navigation.
 */
export function MobileNav() {
  const open = useAppStore((s) => s.sidebarOpen);
  const setOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle asChild>
            <AppLogo />
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 p-3">
          {PRIMARY_NAV.map((item) => (
            <NavigationItem
              key={item.id}
              to={item.path}
              label={item.label}
              icon={item.icon}
              end={item.end}
              variant="sidebar"
              onNavigate={() => setOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
