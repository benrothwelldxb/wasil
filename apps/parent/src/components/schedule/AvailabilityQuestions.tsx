import { useState } from 'react'
import { useApi, api } from '@wasil/shared'
import type { ThisWeekAvailabilityAsk } from '@wasil/shared'
import { dayLabel } from '../../utils/schoolDay'

// Shared by This Week and the home page, so an answer given in either place is
// the same answer, sent the same way.

/**
 * "Can they play?" — above the week and across every child, because the fixture
 * is often next week and may be a sibling's. A push about it arrives with no
 * other way to answer. When there is nothing open, or the questions could not
 * be loaded, this says nothing: the week below has its own messages.
 */
export function AvailabilityQuestions({ heading = 'The school is asking' }: { heading?: string } = {}) {
  const { data } = useApi<{ asks: ThisWeekAvailabilityAsk[] }>(() => api.thisWeek.availability(), [])
  const asks = data?.asks ?? []
  if (asks.length === 0) return null
  // Once every question has a reply nothing is being asked any more; the
  // heading says what the compact rows below are instead.
  const allAnswered = asks.every((a) => a.state !== 'unknown')

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold" style={{ color: '#4A3B3F' }}>{allAnswered ? 'Your replies to the school' : heading}</h3>
      {asks.map((ask) => (
        <AvailabilityCard key={`${ask.fixtureId}:${ask.studentId}`} ask={ask} />
      ))}
    </div>
  )
}

function AvailabilityCard({ ask }: { ask: ThisWeekAvailabilityAsk }) {
  const [state, setState] = useState(ask.state)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // An answered question shrinks to one line, so it stops taking the top of
  // the page once there is nothing left to do. "Change" opens it again.
  const [open, setOpen] = useState(false)
  const firstName = ask.childName.split(' ')[0]
  const { weekday, day } = dayLabel(ask.date)

  async function reply(next: 'available' | 'unavailable') {
    setSaving(true)
    setProblem(null)
    try {
      await api.thisWeek.replyAvailability({ studentId: ask.studentId, fixtureId: ask.fixtureId, state: next })
      setState(next)
      setOpen(false)
    } catch (e) {
      setProblem(
        e instanceof Error && e.message.includes('fixture_closed')
          ? 'This fixture is no longer taking replies. The school office can help.'
          : "That didn't go through. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const button = (value: 'available' | 'unavailable', label: string) => (
    <button
      type="button"
      disabled={saving}
      aria-pressed={state === value}
      onClick={() => reply(value)}
      className="flex-1 px-3 py-2 rounded-full text-sm font-bold transition-colors disabled:opacity-50"
      style={
        state === value
          ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
          : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
      }
    >
      {label}
    </button>
  )

  if (state !== 'unknown' && !open && !problem) {
    const yes = state === 'available'
    return (
      <div
        className="rounded-xl px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6' }}
      >
        <span
          aria-hidden
          className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          style={yes ? { backgroundColor: '#C4506E', color: '#FFFFFF' } : { backgroundColor: '#F0E4E6', color: '#7A6469' }}
        >
          {yes ? '✓' : '✕'}
        </span>
        <p className="flex-1 min-w-0 text-xs truncate" style={{ color: '#4A3B3F' }}>
          <span className="font-bold">{firstName} {yes ? 'can play' : "can't play"}</span>
          <span style={{ color: '#7A6469' }}> · {ask.name} · {weekday} {day}</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-bold flex-shrink-0 px-2 py-1"
          style={{ color: '#C4506E' }}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6' }}>
      <p className="text-sm font-bold" style={{ color: '#4A3B3F' }}>Can {firstName} play?</p>
      <p className="text-xs mt-0.5" style={{ color: '#7A6469' }}>
        {ask.name} · {weekday} {day}, {ask.startsAt}
        {ask.venue ? ` · ${ask.venue}` : ''}
      </p>
      <div className="flex gap-2 mt-2">
        {button('available', 'Yes, can play')}
        {button('unavailable', "No, can't play")}
      </div>
      {state !== 'unknown' && !problem && (
        <p className="text-xs mt-2" style={{ color: '#A8929A' }}>
          {ask.respondedVia === 'staff' && state === ask.state
            ? 'This is what the school has down. You can change it here.'
            : 'The school can see your answer. You can change it here.'}
        </p>
      )}
      {problem && <p className="text-xs mt-2" role="alert" style={{ color: '#C4506E' }}>{problem}</p>}
    </div>
  )
}
