import React, { useMemo, useState } from 'react'
import { Calendar, MapPin, Clock, Users, Check, X, HelpCircle } from 'lucide-react'
import { useApi, useMutation } from '@wasil/shared'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { Event, EventRsvpStatus, Class } from '@wasil/shared'

export function EventsPage() {
  const theme = useTheme()
  const { user } = useAuth()
  const [selectedFilter, setSelectedFilter] = useState<string>('all')

  const { data: events, setData: setEvents, isLoading } = useApi<Event[]>(
    () => api.events.list(),
    []
  )

  const { data: allClasses } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )

  // Build class color map from actual class data
  const classColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    const CLASS_COLOR_HEX: Record<string, string> = {
      'bg-gray-600': '#4B5563', 'bg-blue-600': '#2563EB', 'bg-red-600': '#DC2626',
      'bg-green-600': '#16A34A', 'bg-purple-600': '#9333EA', 'bg-amber-500': '#F59E0B',
      'bg-teal-600': '#0D9488', 'bg-pink-600': '#DB2777', 'bg-orange-600': '#EA580C',
      'bg-indigo-600': '#4F46E5', 'bg-blue-500': '#3b82f6',
    }
    allClasses?.forEach(c => {
      map[c.name] = CLASS_COLOR_HEX[c.colorBg] || '#4B5563'
    })
    return map
  }, [allClasses])

  const { mutate: submitRsvp } = useMutation(api.events.rsvp)

  // Get user's children's classes
  const userClasses = useMemo(() => {
    const classes = user?.children?.map((c) => c.className) || []
    return [...new Set(classes)]
  }, [user])

  const filterOptions = ['all', 'Whole School', ...userClasses]

  // Filter and group events by month
  const groupedEvents = useMemo(() => {
    if (!events) return []

    let filtered = events
    if (selectedFilter !== 'all') {
      filtered = events.filter(
        (e) => e.targetClass === selectedFilter || e.targetClass === 'Whole School'
      )
    }

    // Sort by date
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Group by month
    const groups: Record<string, { monthLabel: string; events: Event[] }> = {}

    sorted.forEach((event) => {
      const date = new Date(event.date)
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`
      const monthLabel = date.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })

      if (!groups[monthKey]) {
        groups[monthKey] = { monthLabel, events: [] }
      }
      groups[monthKey].events.push(event)
    })

    return Object.values(groups)
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
      month: date.toLocaleDateString('en-GB', { month: 'short' }),
    }
  }

  const getFilterLabel = (filter: string) => {
    if (filter === 'all') return 'All Events'
    return filter
  }

  const getRsvpButton = (event: Event) => {
    if (!event.requiresRsvp) return null

    const buttons = [
      { status: 'attending' as EventRsvpStatus, icon: Check, label: 'Yes', color: 'green' },
      { status: 'maybe' as EventRsvpStatus, icon: HelpCircle, label: 'Maybe', color: 'amber' },
      { status: 'not_attending' as EventRsvpStatus, icon: X, label: 'No', color: 'red' },
    ]

    return (
      <div className="flex items-center space-x-2 mt-3">
        <span className="text-sm text-gray-500 mr-2">RSVP:</span>
        {buttons.map(({ status, icon: Icon, label, color }) => {
          const isSelected = event.userRsvp === status
          return (
            <button
              key={status}
              onClick={() => handleRsvp(event.id, status)}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? `bg-${color}-100 text-${color}-700 border-2 border-${color}-500`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: color === 'green' ? '#dcfce7' : color === 'amber' ? '#fef3c7' : '#fee2e2',
                      color: color === 'green' ? '#15803d' : color === 'amber' ? '#b45309' : '#b91c1c',
                      borderColor: color === 'green' ? '#22c55e' : color === 'amber' ? '#f59e0b' : '#ef4444',
                      borderWidth: '2px',
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          Events Calendar
        </h1>
        <p className="text-gray-600 mt-1">Upcoming school events and activities</p>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedFilter === filter
                ? 'text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
            style={
              selectedFilter === filter
                ? { backgroundColor: theme.colors.brandColor }
                : undefined
            }
          >
            {getFilterLabel(filter)}
          </button>
        ))}
      </div>

      {/* Events List */}
      {groupedEvents.length > 0 ? (
        <div className="space-y-8">
          {groupedEvents.map((group) => (
            <div key={group.monthLabel}>
              {/* Month Header */}
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Calendar className="h-5 w-5 mr-2" style={{ color: theme.colors.brandColor }} />
                {group.monthLabel}
              </h2>

              {/* Events */}
              <div className="space-y-4">
                {group.events.map((event) => {
                  const dateInfo = formatDate(event.date)
                  const classColor = event.classId
                    ? (classColorMap[event.targetClass] || '#4B5563')
                    : theme.colors.brandColor

                  return (
                    <div
                      key={event.id}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      <div className="flex">
                        {/* Date Badge */}
                        <div
                          className="w-20 flex-shrink-0 flex flex-col items-center justify-center py-4"
                          style={{ backgroundColor: classColor }}
                        >
                          <span className="text-white text-xs font-medium uppercase">
                            {dateInfo.weekday}
                          </span>
                          <span className="text-white text-2xl font-bold">
                            {dateInfo.day}
                          </span>
                          <span className="text-white text-xs font-medium uppercase">
                            {dateInfo.month}
                          </span>
                        </div>

                        {/* Event Details */}
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg">
                                {event.title}
                              </h3>
                              <span
                                className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium text-white"
                                style={{ backgroundColor: classColor }}
                              >
                                {event.targetClass}
                              </span>
                            </div>
                            {event.requiresRsvp && (
                              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                                RSVP Required
                              </span>
                            )}
                          </div>

                          {event.description && (
                            <p className="text-gray-600 mt-2">{event.description}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                            {event.time && (
                              <span className="flex items-center">
                                <Clock className="h-4 w-4 mr-1" />
                                {event.time}
                              </span>
                            )}
                            {event.location && (
                              <span className="flex items-center">
                                <MapPin className="h-4 w-4 mr-1" />
                                {event.location}
                              </span>
                            )}
                          </div>

                          {/* RSVP Buttons */}
                          {getRsvpButton(event)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No upcoming events.</p>
        </div>
      )}
    </div>
  )
}
