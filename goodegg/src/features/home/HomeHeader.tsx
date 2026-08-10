import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { WordmarkInline } from '@/components/brand/Wordmark'
import { EggMascot } from '@/components/brand/EggMascot'

export function HomeHeader({ unread }: { unread: number }) {
  return (
    <header className="flex items-center justify-between pb-2">
      <Link to="/app" aria-label="Be a Good Egg home">
        <WordmarkInline className="text-xl" />
      </Link>
      <div className="flex items-center gap-2">
        <Link
          to="/app/messages"
          aria-label={`Messages${unread ? `, ${unread} unread` : ''}`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"
        >
          <Bell size={20} className="text-ink" aria-hidden />
          {unread > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-coral ring-2 ring-white" />
          )}
        </Link>
        <Link
          to="/app/profile"
          aria-label="Your profile"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-yolk-soft shadow-card"
        >
          <EggMascot mood="default" className="h-8 w-8" />
        </Link>
      </div>
    </header>
  )
}
