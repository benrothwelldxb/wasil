import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, Settings, Sparkles, UtensilsCrossed } from 'lucide-react'
import { useProviderAuth } from '../auth'

const ECA_LINKS = [
  { to: '/activities', icon: CalendarDays, title: 'Activities', body: 'Create and manage your clubs — schedule, capacity, cost and payment link.' },
  { to: '/bookings', icon: ClipboardList, title: 'Bookings', body: 'See who has enrolled and update payment as it comes in.' },
  { to: '/profile', icon: Settings, title: 'Profile', body: 'Your provider details and contact information.' },
]
const CATERING_LINKS = [
  { to: '/menus', icon: UtensilsCrossed, title: 'Menus', body: 'Publish the weekly lunch menu — dishes, dietary tags and allergens.' },
  { to: '/profile', icon: Settings, title: 'Profile', body: 'Your provider details and contact information.' },
]

export function DashboardPage() {
  const { providerUser } = useProviderAuth()
  const firstName = providerUser?.name?.split(' ')[0] || 'there'
  const provider = providerUser?.provider
  const links = provider?.type === 'CATERING' ? CATERING_LINKS : ECA_LINKS

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-warm-text-primary">Welcome, {firstName}</h1>
      <p className="text-warm-text-secondary mt-1">
        {provider ? `You're managing ${provider.name}.` : 'Your provider account is set up.'}
      </p>

      <div className="warm-card p-5 mt-6 flex items-start gap-4">
        <div className="h-10 w-10 rounded-warm bg-brand/10 flex items-center justify-center flex-none">
          <Sparkles className="h-5 w-5 text-brand" />
        </div>
        <div>
          <div className="font-bold text-warm-text-primary">Everything's ready</div>
          <p className="text-sm text-warm-text-secondary mt-0.5">
            {provider?.type === 'CATERING'
              ? 'Publish your weekly menus and families will see them in the app.'
              : 'Create clubs, take bookings, and track payment — all from here.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mt-6">
        {links.map(({ to, icon: Icon, title, body }) => (
          <Link key={to} to={to} className="warm-card p-5 hover:border-brand/40 transition-colors">
            <div className="h-9 w-9 rounded-warm bg-slate-50 flex items-center justify-center mb-3">
              <Icon className="h-5 w-5 text-warm-text-secondary" />
            </div>
            <div className="font-bold text-sm text-warm-text-primary">{title}</div>
            <p className="text-sm text-warm-text-secondary mt-1">{body}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
