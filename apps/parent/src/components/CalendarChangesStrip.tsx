import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, X } from 'lucide-react'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { CalendarChanges } from '@wasil/shared'

/**
 * "Two events moved" — a small, dismissable line on the parent dashboard.
 *
 * Deliberately not a push and not a notification row. A date change matters,
 * but calendar events arrive from Hub in bulk all term, and interrupting three
 * hundred families every time one shifts would train them to ignore the app.
 * This is something a parent finds, not something that finds them.
 *
 * Dismissal remembers the newest change it was showing, not the fact of being
 * dismissed: a later change brings the strip back rather than being silenced
 * along with the one the parent had already read.
 */
const DISMISSED_KEY = 'calendarChangesDismissedAt'

function readDismissed(): string | null {
  // Wrapped: a private window or blocked site data throws on access, and a
  // dashboard should not fail to render because a convenience is unavailable.
  try {
    return localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function fmt(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function CalendarChangesStrip() {
  const { data } = useApi<CalendarChanges | null>(() => api.events.recentChanges(), [])
  const [dismissedAt, setDismissedAt] = useState<string | null>(() => readDismissed())

  const changes = data?.changes ?? []
  const latest = data?.latestChangedAt ?? null
  if (changes.length === 0 || !latest) return null
  // Nothing has changed since the parent last dismissed this.
  if (dismissedAt && latest <= dismissedAt) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, latest)
    } catch {
      // Storage unavailable — the strip still goes for this session, which is
      // what the parent asked for. It comes back next visit, which is a far
      // smaller problem than a dismiss button that appears not to work.
    }
    setDismissedAt(latest)
  }

  const first = changes[0]
  const others = changes.length - 1

  return (
    <div
      className="flex items-center gap-3 rounded-[18px] px-4 py-3"
      style={{ backgroundColor: '#FFF6E9', border: '1.5px solid #F3E2C7' }}
    >
      <CalendarClock className="h-4 w-4 flex-shrink-0" style={{ color: '#B0762C' }} />
      <Link to="/events" className="min-w-0 flex-1">
        <p className="text-[13px] font-bold truncate" style={{ color: '#8A5A18' }}>
          {first.title}
          {/* One line, whatever the count. A parent needs to know something
              moved and where to look — the calendar itself carries the detail. */}
          {others > 0 && ` and ${others} other${others > 1 ? 's' : ''}`}
        </p>
        <p className="text-[12px] font-semibold truncate" style={{ color: '#B0762C' }}>
          {first.previousDate && first.previousDate !== first.date
            ? `Moved from ${fmt(first.previousDate)} to ${fmt(first.date)}`
            : `Updated · ${fmt(first.date)}`}
        </p>
      </Link>
      <button
        onClick={dismiss}
        className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0"
        style={{ color: '#B0762C' }}
        aria-label="Dismiss calendar changes"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
