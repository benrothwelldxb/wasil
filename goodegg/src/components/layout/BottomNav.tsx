import { NavLink } from 'react-router-dom'
import { Home, Star, Mail, User, Settings } from 'lucide-react'
import { cn } from '@/lib/cn'

const tabs = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/missions', label: 'Missions', icon: Star, end: false },
  { to: '/app/messages', label: 'Messages', icon: Mail, end: false },
  { to: '/app/profile', label: 'Profile', icon: User, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
]

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-cream-300 bg-cream-50/90 backdrop-blur safe-bottom"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.68rem] font-semibold transition-colors',
                  isActive ? 'text-coral' : 'text-ink-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.4 : 2}
                    className="transition-transform"
                    aria-hidden
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
