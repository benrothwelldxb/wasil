import { NavLink, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', icon: 'Sun' },
  { to: '/insights', label: 'Insights', icon: 'LineChart' },
  { to: '/learn', label: 'Learn', icon: 'BookOpen' },
  { to: '/profile', label: 'Me', icon: 'User' },
];

/**
 * Persistent bottom navigation with a prominent central check-in action.
 * The Add button sits above the bar as an elevated, elegant control.
 */
export function BottomNavigation() {
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-20 border-t border-border/60 bg-card/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-nav"
    >
      <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
        <NavTab item={NAV_ITEMS[0]!} />
        <NavTab item={NAV_ITEMS[1]!} />

        {/* Central check-in action */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => navigate('/check-in')}
            aria-label="Start check-in"
            className="-mt-8 flex size-16 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised ring-4 ring-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
          >
            <Plus className="size-6" strokeWidth={2} aria-hidden="true" />
            <span className="mt-0.5 text-[10px] font-semibold">Check-in</span>
          </button>
        </div>

        <NavTab item={NAV_ITEMS[2]!} />
        <NavTab item={NAV_ITEMS[3]!} />
      </div>
    </nav>
  );
}

function NavTab({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex h-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            name={item.icon}
            className={cn('size-6', isActive && 'text-primary')}
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}
