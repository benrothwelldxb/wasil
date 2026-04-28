import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Clock, Users, Check, X, HelpCircle, Download, CalendarPlus, List, Grid3X3, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi, useMutation } from '@wasil/shared'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { Event, EventRsvpStatus, Class } from '@wasil/shared'

type ViewMode = 'list' | 'calendar'

export function EventsPage() {
  const { t } = useTranslation()
  const theme = useTheme()
  const { user } = useAuth()
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)

  const { data: events, setData: setEvents, isLoading } = useApi<Event[]>(
    () => api.events.list(),
    []
  )

  const { data: allClasses } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )

  const { mutate: submitRsvp } = useMutation(api.events.rsvp)

  // Get user's children's classes (deduplicated)
  const userClasses = useMemo(() => {
    const classes: string[] = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach(l => { if (!seen.has(l.className)) { seen.add(l.className); classes.push(l.className) } })
    user?.children?.forEach(c => { if (!seen.has(c.className)) { seen.add(c.className); classes.push(c.className) } })
    return classes
  }, [user])

  const filterOptions = ['all', 'Whole School', ...userClasses]

  const isWholeSchool = (targetClass: string) =>
    targetClass === 'Whole School' || targetClass === 'all' || targetClass === 'All Parents'

  // All filtered events (used by both views)
  const filteredEvents = useMemo(() => {
    if (!events) return []
    if (selectedFilter === 'all') return events
    if (selectedFilter === 'Whole School') return events.filter(e => isWholeSchool(e.targetClass))
    return events.filter(e => e.targetClass === selectedFilter || isWholeSchool(e.targetClass))
  }, [events, selectedFilter])

  // Events indexed by date string for calendar
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>()
    filteredEvents.forEach(e => {
      const key = e.date.split('T')[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    return map
  }, [filteredEvents])

  // Filter and split events into upcoming and past
  const { upcomingGroups, pastEvents } = useMemo(() => {
    if (!events) return { upcomingGroups: [], pastEvents: [] }

    let filtered = events
    if (selectedFilter !== 'all') {
      if (selectedFilter === 'Whole School') {
        filtered = events.filter((e) => isWholeSchool(e.targetClass))
      } else {
        filtered = events.filter(
          (e) => e.targetClass === selectedFilter || isWholeSchool(e.targetClass)
        )
      }
    }

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const upcoming = filtered.filter(e => new Date(e.date) >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const past = filtered.filter(e => new Date(e.date) < now)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const groups: Record<string, { monthLabel: string; events: Event[] }> = {}
    upcoming.forEach((event) => {
      const date = new Date(event.date)
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`
      const monthLabel = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      if (!groups[monthKey]) {
        groups[monthKey] = { monthLabel, events: [] }
      }
      groups[monthKey].events.push(event)
    })

    return { upcomingGroups: Object.values(groups), pastEvents: past }
  }, [events, selectedFilter])

  const handleRsvp = async (eventId: string, status: EventRsvpStatus) => {
    await submitRsvp(eventId, status)
    setEvents((prev) =>
      prev?.map((e) =>
        e.id === eventId ? { ...e, userRsvp: status } : e
      ) || null
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return {
      day: date.getDate(),
      weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      month: date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    }
  }

  const getFilterLabel = (filter: string) => {
    if (filter === 'all') return t('events.allEvents', 'All')
    if (filter === 'Whole School') return t('messages.wholeSchool', 'Whole School')
    return filter
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="w-8 h-8 border-4 rounded-full animate-spin"
          style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          {t('events.title', 'Events')}
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          {t('events.subtitle', 'Upcoming school events and activities')}
        </p>
      </div>

      {/* Filter Pills + Add to Calendar */}
      <div className="flex flex-wrap items-center gap-2">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-colors"
            style={
              selectedFilter === filter
                ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
            }
          >
            {getFilterLabel(filter)}
          </button>
        ))}
        {/* View toggle + Add to Calendar */}
        <div className="flex items-center gap-2 ml-auto">
          <div
            className="flex rounded-full overflow-hidden"
            style={{ border: '1.5px solid #F0E4E6' }}
          >
            <button
              onClick={() => setViewMode('list')}
              className="px-3 py-1.5 flex items-center gap-1 text-xs font-bold transition-colors"
              style={viewMode === 'list'
                ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: '#7A6469' }
              }
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className="px-3 py-1.5 flex items-center gap-1 text-xs font-bold transition-colors"
              style={viewMode === 'calendar'
                ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', color: '#7A6469' }
              }
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              Calendar
            </button>
          </div>
          <button
            onClick={() => api.events.exportCalendar()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-colors"
            style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
            title="Add all events to your calendar"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add to Calendar
          </button>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <CalendarView
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          eventsByDate={eventsByDate}
          selectedDate={selectedCalendarDate}
          setSelectedDate={setSelectedCalendarDate}
          handleRsvp={handleRsvp}
          isWholeSchool={isWholeSchool}
          t={t}
        />
      )}

      {/* List View — Upcoming Events */}
      {viewMode === 'list' && upcomingGroups.length > 0 ? (
        <div className="space-y-6">
          {upcomingGroups.map((group) => (
            <div key={group.monthLabel}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#A8929A' }}>
                {group.monthLabel}
              </p>

              <div className="space-y-3">
                {group.events.map((event) => {
                  const dateInfo = formatDate(event.date)

                  return (
                    <div
                      key={event.id}
                      className="bg-white overflow-hidden"
                      style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                    >
                      <div className="p-[18px]">
                        <div className="flex gap-4">
                          {/* Date Block */}
                          <div className="flex-shrink-0 text-center" style={{ width: '52px' }}>
                            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#C4506E' }}>
                              {dateInfo.month}
                            </div>
                            <div className="text-[24px] font-extrabold leading-tight" style={{ color: '#2D2225' }}>
                              {dateInfo.day}
                            </div>
                            <div className="text-[11px] font-semibold" style={{ color: '#A8929A' }}>
                              {dateInfo.weekday}
                            </div>
                          </div>

                          {/* Event Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-[16px] font-bold leading-snug" style={{ color: '#2D2225' }}>
                                {event.title}
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  api.events.exportEventCalendar(event.id, event.title)
                                }}
                                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg"
                                style={{ color: '#A8929A' }}
                                title="Add to calendar"
                              >
                                <CalendarPlus className="h-4 w-4" />
                              </button>
                            </div>

                            <p className="text-[13px] font-semibold mt-0.5" style={{ color: '#7A6469' }}>
                              {isWholeSchool(event.targetClass) ? t('messages.wholeSchool', 'Whole School') : event.targetClass}
                            </p>

                            {event.description && (
                              <p className="text-sm font-medium mt-2 leading-relaxed" style={{ color: '#7A6469' }}>
                                {event.description}
                              </p>
                            )}

                            {/* Time & Location */}
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              {event.time && (
                                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#A8929A' }}>
                                  <Clock className="h-3.5 w-3.5" />
                                  {event.time}
                                </span>
                              )}
                              {event.location && (
                                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#A8929A' }}>
                                  <MapPin className="h-3.5 w-3.5" />
                                  {event.location}
                                </span>
                              )}
                            </div>

                            {/* RSVP */}
                            {event.requiresRsvp && (
                              <div className="flex items-center gap-2 mt-3">
                                <button
                                  onClick={() => handleRsvp(event.id, 'attending')}
                                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[13px] font-bold transition-colors"
                                  style={
                                    event.userRsvp === 'attending'
                                      ? { backgroundColor: '#EDFAF2', color: '#5BA97B', border: '1.5px solid #5BA97B' }
                                      : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                                  }
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {t('events.attending', 'Going')}
                                </button>
                                <button
                                  onClick={() => handleRsvp(event.id, 'not_attending')}
                                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[13px] font-bold transition-colors"
                                  style={
                                    event.userRsvp === 'not_attending'
                                      ? { backgroundColor: '#FEF2F2', color: '#D14D4D', border: '1.5px solid #D14D4D' }
                                      : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                                  }
                                >
                                  <X className="h-3.5 w-3.5" />
                                  {t('events.notAttending', "Can't go")}
                                </button>
                                <button
                                  onClick={() => handleRsvp(event.id, 'maybe')}
                                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[13px] font-bold transition-colors"
                                  style={
                                    event.userRsvp === 'maybe'
                                      ? { backgroundColor: '#FFF7EC', color: '#8B5E0F', border: '1.5px solid #E8A54B' }
                                      : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                                  }
                                >
                                  <HelpCircle className="h-3.5 w-3.5" />
                                  {t('events.maybe', 'Maybe')}
                                </button>
                              </div>
                            )}

                            {!event.requiresRsvp && event.userRsvp === 'attending' && (
                              <span
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold mt-2"
                                style={{ backgroundColor: '#EDFAF2', color: '#5BA97B' }}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Attending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div
          className="bg-white p-12 text-center"
          style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
        >
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p className="font-medium" style={{ color: '#A8929A' }}>{t('events.noEvents', 'No upcoming events')}</p>
        </div>
      ) : null}

      {/* Past Events */}
      {viewMode === 'list' && pastEvents.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#A8929A' }}>
            Past Events
          </p>
          <div className="space-y-1.5">
            {pastEvents.map((event) => {
              const date = new Date(event.date)
              const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-4 py-3 bg-white"
                  style={{ borderRadius: '14px', border: '1px solid #F0E4E6', opacity: 0.7 }}
                >
                  <span className="text-xs font-bold shrink-0" style={{ color: '#A8929A', width: '80px' }}>
                    {dateStr}
                  </span>
                  <span className="text-sm font-semibold truncate" style={{ color: '#2D2225' }}>
                    {event.title}
                  </span>
                  {event.location && (
                    <span className="text-xs font-medium shrink-0 hidden sm:block" style={{ color: '#A8929A' }}>
                      {event.location}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Calendar View Component
// ==========================================

interface CalendarViewProps {
  calendarMonth: { year: number; month: number }
  setCalendarMonth: React.Dispatch<React.SetStateAction<{ year: number; month: number }>>
  eventsByDate: Map<string, Event[]>
  selectedDate: string | null
  setSelectedDate: (date: string | null) => void
  handleRsvp: (eventId: string, status: EventRsvpStatus) => void
  isWholeSchool: (targetClass: string) => boolean
  t: any
}

function CalendarView({ calendarMonth, setCalendarMonth, eventsByDate, selectedDate, setSelectedDate, handleRsvp, isWholeSchool, t }: CalendarViewProps) {
  const { year, month } = calendarMonth
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const monthLabel = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Build calendar grid
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = lastDay.getDate()

  const prevMonth = () => {
    setCalendarMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 }
      return { ...prev, month: prev.month - 1 }
    })
    setSelectedDate(null)
  }

  const nextMonth = () => {
    setCalendarMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 }
      return { ...prev, month: prev.month + 1 }
    })
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCalendarMonth({ year: today.getFullYear(), month: today.getMonth() })
    setSelectedDate(todayStr)
  }

  // Events for selected date
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : []

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold" style={{ color: '#2D2225' }}>{monthLabel}</h2>
          {(year !== today.getFullYear() || month !== today.getMonth()) && (
            <button onClick={goToToday} className="text-xs font-semibold" style={{ color: '#C4506E' }}>
              Back to today
            </button>
          )}
        </div>
        <button
          onClick={nextMonth}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ChevronRight className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
      </div>

      {/* Calendar grid */}
      <div
        className="bg-white rounded-[22px] overflow-hidden"
        style={{ border: '1.5px solid #F0E4E6' }}
      >
        {/* Day headers */}
        <div className="grid grid-cols-7">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="py-2 text-center text-[11px] font-bold uppercase" style={{ color: '#A8929A' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7" style={{ borderTop: '1px solid #F0E4E6' }}>
          {/* Empty cells before first day */}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="py-2 min-h-[52px]" style={{ backgroundColor: '#FAF8F6' }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
            const dayEvents = eventsByDate.get(dateStr) || []
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const hasEvents = dayEvents.length > 0

            return (
              <button
                key={dayNum}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className="py-1.5 min-h-[52px] flex flex-col items-center justify-start transition-colors relative"
                style={{
                  backgroundColor: isSelected ? '#FFF0F3' : isToday ? '#FAF5F7' : undefined,
                  borderRight: '1px solid #F5EEF0',
                  borderBottom: '1px solid #F5EEF0',
                }}
              >
                <span
                  className="text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full"
                  style={{
                    color: isSelected ? '#C4506E' : isToday ? '#C4506E' : '#2D2225',
                    backgroundColor: isToday && !isSelected ? '#FFF0F3' : undefined,
                  }}
                >
                  {dayNum}
                </span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((_, idx) => (
                      <div
                        key={idx}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: '#C4506E' }}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] font-bold" style={{ color: '#C4506E' }}>+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#A8929A' }}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {selectedEvents.length > 0 ? (
            <div className="space-y-2">
              {selectedEvents.map(event => (
                <div
                  key={event.id}
                  className="bg-white rounded-[18px] p-4"
                  style={{ border: '1.5px solid #F0E4E6' }}
                >
                  <h3 className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{event.title}</h3>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: '#7A6469' }}>
                    {isWholeSchool(event.targetClass) ? 'Whole School' : event.targetClass}
                  </p>
                  {event.description && (
                    <p className="text-sm mt-1" style={{ color: '#7A6469' }}>{event.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {event.time && (
                      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#A8929A' }}>
                        <Clock className="h-3.5 w-3.5" />{event.time}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#A8929A' }}>
                        <MapPin className="h-3.5 w-3.5" />{event.location}
                      </span>
                    )}
                  </div>
                  {event.requiresRsvp && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleRsvp(event.id, 'attending')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={event.userRsvp === 'attending'
                          ? { backgroundColor: '#EDFAF2', color: '#5BA97B', border: '1.5px solid #5BA97B' }
                          : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                        }
                      >
                        <Check className="h-3 w-3" />Going
                      </button>
                      <button
                        onClick={() => handleRsvp(event.id, 'not_attending')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={event.userRsvp === 'not_attending'
                          ? { backgroundColor: '#FEF2F2', color: '#D14D4D', border: '1.5px solid #D14D4D' }
                          : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                        }
                      >
                        <X className="h-3 w-3" />Can't go
                      </button>
                      <button
                        onClick={() => handleRsvp(event.id, 'maybe')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={event.userRsvp === 'maybe'
                          ? { backgroundColor: '#FFF7EC', color: '#8B5E0F', border: '1.5px solid #E8A54B' }
                          : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                        }
                      >
                        <HelpCircle className="h-3 w-3" />Maybe
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: '#A8929A' }}>No events on this day</p>
          )}
        </div>
      )}
    </div>
  )
}
