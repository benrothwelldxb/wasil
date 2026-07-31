import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { Logo } from '@/components/layout/Logo'
import { primaryNavItems } from '@/components/layout/navigation'

/** Persistent left navigation shown on large screens only. */
export function DesktopSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 lg:flex lg:flex-col">
      <div className="safe-top flex h-14 items-center px-6">
        <Logo />
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {primaryNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="px-6 py-4 text-xs text-muted-foreground">
        Snap · Tap · Done
      </div>
    </aside>
  )
}
