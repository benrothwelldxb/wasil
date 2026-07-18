import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CalendarDays, LayoutDashboard, LogOut, Settings, UtensilsCrossed, Users } from 'lucide-react'
import { useProviderAuth } from '../auth'

const ECA_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/activities', label: 'Activities', icon: CalendarDays, end: false },
  { to: '/bookings', label: 'Bookings', icon: Users, end: false },
  { to: '/profile', label: 'Profile', icon: Settings, end: false },
]
const CATERING_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/menus', label: 'Menus', icon: UtensilsCrossed, end: false },
  { to: '/profile', label: 'Profile', icon: Settings, end: false },
]

export function ProviderLayout() {
  const { providerUser, logout } = useProviderAuth()
  const navigate = useNavigate()
  const NAV = providerUser?.provider?.type === 'CATERING' ? CATERING_NAV : ECA_NAV

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const provider = providerUser?.provider

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-warm-border flex flex-col fixed inset-y-0">
        <div className="px-5 py-5 border-b border-warm-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-warm bg-brand/10 flex items-center justify-center overflow-hidden">
              {provider?.logoUrl ? (
                <img src={provider.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Users className="h-5 w-5 text-brand" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-warm-text-primary truncate">{provider?.name || 'Provider'}</div>
              <div className="text-xs text-warm-text-tertiary capitalize">{provider?.type?.toLowerCase() || 'provider'} portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-warm text-sm font-semibold transition-colors ${
                  isActive ? 'bg-brand/10 text-brand' : 'text-warm-text-secondary hover:bg-slate-50'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-warm-border">
          <div className="px-3 pb-2 text-xs text-warm-text-tertiary truncate">{providerUser?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-warm text-sm font-semibold text-warm-text-secondary hover:bg-slate-50 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-64 p-8 max-w-5xl">
        <Outlet />
      </main>
    </div>
  )
}
