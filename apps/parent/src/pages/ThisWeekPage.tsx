import React, { useMemo, useState } from 'react'
import { CalendarDays, MapPin, Trophy, Users, AlertCircle } from 'lucide-react'
import { useApi, api, useAuth } from '@wasil/shared'
import type { ThisWeekResponse, ThisWeekDay, ThisWeekItem } from '@wasil/shared'

interface ChildRef { id: string; name: string; className?: string }

/** The device's LOCAL date, not the UTC one — `toISOString()` is UTC, and in a
 *  UTC+ timezone every evening after 8pm it returns yesterday. */
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A date label from a YYYY-MM-DD string, built from its own parts.
 *
 *  Deliberately NOT `new Date(dateStr)` then toLocaleDateString: that parses as
 *  UTC midnight and renders in the device's zone, so a parent west of the
 *  school sees every day shifted back by one. The string names a day at the
 *  school; only its parts are used. */
function dayLabel(dateStr: string): { weekday: string; day: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  return {
    weekday: at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    day: at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  }
}

const isCancelled = (s: string) => s === 'cancelled' || s === 'postponed'

function ItemCard({ item, childName, fixtures }: {
  item: ThisWeekItem
  childName: string
  fixtures: Map<string, ThisWeekItem>
}) {
  const cancelled = isCancelled(item.status)
  // The single most valuable thing in the payload, and it deserves prose rather
  // than a flag: a parent who isn't told WHY their child is missing a club they
  // know about will ring the office to ask.
  const displacedBy = item.displaced_by_fixture_id
    ? fixtures.get(item.displaced_by_fixture_id)
    : undefined

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        backgroundColor: cancelled ? '#FBF7F7' : '#FFFFFF',
        borderColor: '#F0E4E6',
        opacity: cancelled ? 0.85 : 1,
      }}
    >
      <div className="flex items-start gap-2">
        {item.kind === 'fixture'
          ? <Trophy className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#C4506E' }} />
          : <Users className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#A8929A' }} />}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold"
            style={{ color: '#4A3B3F', textDecoration: cancelled ? 'line-through' : 'none' }}
          >
            {item.name}
          </p>

          {/* Times are printed exactly as Active sent them — wall clock at the
              school. No conversion, no locale formatting, no Date parsing. */}
          <p className="text-xs mt-0.5" style={{ color: '#7A6469' }}>
            {item.departs_at
              ? `Leaves ${item.departs_at}${item.returns_at ? ` · back ${item.returns_at}` : ''}`
              : `${item.starts_at}${item.ends_at ? `–${item.ends_at}` : ''}`}
          </p>

          {item.venue && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#A8929A' }}>
              <MapPin className="h-3 w-3" /> {item.venue}
            </p>
          )}

          {/* The school's own words, verbatim. */}
          {cancelled && (
            <p className="text-xs mt-1 font-medium" style={{ color: '#C4506E' }}>
              {item.status === 'postponed' ? 'Postponed' : 'Cancelled'}
              {item.cancellation_reason ? ` — ${item.cancellation_reason}` : ''}
            </p>
          )}

          {displacedBy && (
            <p className="text-xs mt-1" style={{ color: '#7A6469' }}>
              {childName.split(' ')[0]} will miss this — {childName.split(' ')[0] === childName ? 'they are' : 'they are'} at the {displacedBy.name}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function DayBlock({ day, childName }: { day: ThisWeekDay; childName: string }) {
  const { weekday, day: date } = dayLabel(day.date)
  // Fixtures are looked up by id so a displaced club can name the one that
  // took the child away.
  const fixtures = useMemo(() => {
    const m = new Map<string, ThisWeekItem>()
    for (const i of day.items) if (i.id) m.set(i.id, i)
    return m
  }, [day.items])

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-sm font-bold" style={{ color: '#4A3B3F' }}>{weekday}</h3>
        <span className="text-xs" style={{ color: '#A8929A' }}>{date}</span>
      </div>
      {day.items.length === 0 ? (
        // An empty day still says something. A blank space reads as a page that
        // failed to load.
        <p className="text-xs px-3 py-2 rounded-xl" style={{ color: '#A8929A', backgroundColor: '#FBF7F7' }}>
          Nothing on — finishes at the usual time.
        </p>
      ) : (
        <div className="space-y-2">
          {day.items.map((item, i) => (
            <ItemCard key={item.id ?? i} item={item} childName={childName} fixtures={fixtures} />
          ))}
        </div>
      )}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: '#FBF7F7' }}>
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#C4506E' }} />
      <p className="text-sm" style={{ color: '#7A6469' }}>{children}</p>
    </div>
  )
}

export function ThisWeekPage() {
  const { user } = useAuth()

  const children = useMemo<ChildRef[]>(() => {
    const out: ChildRef[] = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach((l) => {
      if (seen.has(l.studentId)) return
      seen.add(l.studentId)
      out.push({ id: l.studentId, name: l.studentName.trim(), className: l.className })
    })
    user?.children?.forEach((c) => {
      if (seen.has(c.id)) return
      seen.add(c.id)
      out.push({ id: c.id, name: c.name.trim(), className: c.className })
    })
    return out
  }, [user])

  const [selectedChildId, setSelectedChildId] = useState<string>(() => children[0]?.id ?? '')
  const activeChildId = children.some((c) => c.id === selectedChildId)
    ? selectedChildId
    : children[0]?.id ?? ''

  const { data, isLoading } = useApi<ThisWeekResponse | null>(
    () => (activeChildId ? api.thisWeek.child(activeChildId, todayISO()) : Promise.resolve(null)),
    [activeChildId],
  )

  const childName = data?.childName ?? children.find(c => c.id === activeChildId)?.name ?? 'your child'
  const firstName = childName.split(' ')[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5" style={{ color: '#C4506E' }} />
        <h2 className="text-lg font-bold" style={{ color: '#4A3B3F' }}>This Week</h2>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className="px-4 py-2 rounded-full text-sm font-bold transition-colors"
              style={
                activeChildId === child.id
                  ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
              }
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-sm" style={{ color: '#A8929A' }}>Loading…</p>}

      {/* Three of the four states would otherwise render as a quiet week, and
          "your child has no clubs" is a confident written claim to a family. */}
      {!isLoading && data?.state === 'not_synced' && (
        <Notice>We're still setting up {firstName}'s clubs. Check back shortly.</Notice>
      )}
      {!isLoading && data?.state === 'no_hub_link' && (
        <Notice>We can't show {firstName}'s clubs yet. The school office can help.</Notice>
      )}
      {!isLoading && data?.state === 'unavailable' && (
        <Notice>Clubs and fixtures aren't available right now. Please try again later.</Notice>
      )}

      {!isLoading && data?.state === 'ok' && (
        <div className="space-y-4">
          {(data.days ?? []).map((day) => (
            <DayBlock key={day.date} day={day} childName={childName} />
          ))}
        </div>
      )}
    </div>
  )
}
