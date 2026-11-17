import { Link } from 'react-router-dom'
import { Trophy, MapPin, Megaphone, ChevronRight } from 'lucide-react'
import { useApi, api } from '@wasil/shared'
import type { FixtureDayCard, FixtureDayResponse, FixtureUpdateMessage, ThisWeekItem } from '@wasil/shared'
import { dayLabel } from '../../utils/schoolDay'
import { fixtureTimeLines, fixtureDetailRows } from '../../utils/fixtureTimes'
import { addDaysISO } from '../../utils/fixtureDay'

/**
 * The top of the home page on a fixture day: where the child is going, when
 * they leave, when the match starts and when to collect them, and anything the
 * school has said about it since. Also tomorrow's fixtures from the afternoon
 * before, and any update about a later fixture from the moment it is sent.
 *
 * Renders nothing when there is nothing to show, or when it could not load: a
 * failed card must never read as "no fixture today".
 */
export function FixtureDay() {
  const { data } = useApi<FixtureDayResponse>(() => api.thisWeek.fixtureDay(), [])
  const cards = data?.cards ?? []
  if (!data || cards.length === 0) return null

  return (
    <div className="space-y-2">
      {cards.map((c) => (
        <FixtureCard key={`${c.studentId}:${c.fixtureId}`} card={c} today={data.today} />
      ))}
      {data.scheduleUnavailable && (
        <p className="text-xs px-1" style={{ color: '#A8929A' }}>
          Fixture times can't be loaded right now. Messages from the school are shown in full.
        </p>
      )}
    </div>
  )
}

function whenLabel(date: string | null, today: string): string {
  if (!date) return 'Coming up'
  if (date === today) return 'Today'
  if (date === addDaysISO(today, 1)) return 'Tomorrow'
  const { weekday, day } = dayLabel(date)
  return `${weekday} ${day}`
}

function FixtureCard({ card, today }: { card: FixtureDayCard; today: string }) {
  const item = card.item
  const cancelled = item ? item.status === 'cancelled' || item.status === 'postponed' : false
  const firstName = card.childName.split(' ')[0] || card.childName
  const when = whenLabel(card.date, today)

  return (
    <Link
      to="/this-week"
      className="block rounded-[22px] overflow-hidden"
      style={{ border: `1.5px solid ${cancelled ? '#E8C4CC' : '#C4506E'}`, backgroundColor: '#FFFFFF' }}
    >
      <div className="px-[18px] py-2 flex items-center gap-2" style={{ backgroundColor: cancelled ? '#FBF7F7' : '#C4506E' }}>
        <Trophy className="h-4 w-4" style={{ color: cancelled ? '#C4506E' : '#FFFFFF' }} />
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: cancelled ? '#C4506E' : '#FFFFFF' }}>
          {when} · {firstName}&apos;s fixture
        </p>
      </div>

      <div className="p-[18px] space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold" style={{ color: '#4A3B3F', textDecoration: cancelled ? 'line-through' : 'none' }}>
              {card.name}
            </p>
            {item && !cancelled && fixtureTimeLines(item).map((line, i) => (
              <p key={i} className="text-sm mt-0.5" style={{ color: '#4A3B3F', fontWeight: i === 0 ? 600 : 500 }}>
                {line}
              </p>
            ))}
            {item?.venue && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#7A6469' }}>
                <MapPin className="h-3 w-3" /> {item.venue}
              </p>
            )}
            {cancelled && (
              <p className="text-sm mt-1 font-bold" style={{ color: '#C4506E' }}>
                {item!.status === 'postponed' ? 'Postponed' : 'Cancelled'}
                {item!.cancellation_reason ? ` — ${item!.cancellation_reason}` : ''}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 mt-1 flex-shrink-0" style={{ color: '#A8929A' }} />
        </div>

        {item && !cancelled && <FixtureDetails item={item} />}

        {card.updates.map((u, i) => <UpdateNote key={i} update={u} />)}
      </div>
    </Link>
  )
}

/** Squad, kit, transport and the note for families, from Active's feed.
 *  Nothing renders for a field Active has not set. Not shown on a cancelled
 *  fixture, where none of it applies. */
export function FixtureDetails({ item }: { item: ThisWeekItem }) {
  const rows = fixtureDetailRows(item)
  if (rows.length === 0 && !item.family_note) return null
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <p key={r.label} className="text-xs" style={{ color: '#4A3B3F' }}>
          <span className="font-bold" style={{ color: '#7A6469' }}>{r.label}: </span>{r.value}
        </p>
      ))}
      {item.family_note && (
        <p className="text-xs whitespace-pre-line rounded-lg p-2 mt-1" style={{ color: '#4A3B3F', backgroundColor: '#FBF7F7' }}>
          {item.family_note}
        </p>
      )}
    </div>
  )
}

/** The school's words, in full and on their own colour, so an update is the
 *  first thing read rather than a line under the times. */
export function UpdateNote({ update }: { update: FixtureUpdateMessage }) {
  const sent = new Date(update.sentAt)
  const at = Number.isNaN(sent.getTime())
    ? ''
    : sent.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="rounded-xl p-3 flex gap-2" style={{ backgroundColor: '#FFF4E0', border: '1px solid #F2D29B' }}>
      <Megaphone className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#B07A1B' }} />
      <div className="min-w-0">
        <p className="text-xs font-bold" style={{ color: '#8B5E0F' }}>
          Update from school{at ? ` · ${at}` : ''}
        </p>
        <p className="text-sm mt-0.5 whitespace-pre-line" style={{ color: '#4A3B3F' }}>{update.message}</p>
      </div>
    </div>
  )
}
