import React from 'react'
import { Calendar, Clock, MapPin } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Event, EventRsvpStatus } from '../../types'

interface EventCardProps {
  event: Event
  onRsvp?: (eventId: string, status: EventRsvpStatus) => void
  classColors?: Record<string, { bg: string; text: string }>
}

export function EventCard({ event, onRsvp, classColors = {} }: EventCardProps) {
  const theme = useTheme()

  const classColor = classColors[event.targetClass] || {
    bg: 'bg-burgundy',
    text: 'text-white',
  }

  const rsvpOptions: { value: EventRsvpStatus; label: string }[] = [
    { value: 'attending', label: 'Attending' },
    { value: 'maybe', label: 'Maybe' },
    { value: 'not_attending', label: 'Not Attending' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span
            className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${classColor.bg} ${classColor.text}`}
            style={
              event.targetClass === 'Whole School'
                ? { backgroundColor: theme.colors.brandColor, color: 'white' }
                : undefined
            }
          >
            {event.targetClass}
          </span>
        </div>

        <h3 className="font-semibold text-gray-900 mb-2">{event.title}</h3>
        {event.description && (
          <p className="text-gray-600 text-sm mb-3">{event.description}</p>
        )}

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>{new Date(event.date).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}</span>
          </div>
          {event.time && (
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>{event.time}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span>{event.location}</span>
            </div>
          )}
        </div>
      </div>

      {event.requiresRsvp && onRsvp && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">RSVP Required</p>
          <div className="flex space-x-2">
            {rsvpOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onRsvp(event.id, option.value)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                  event.userRsvp === option.value
                    ? 'text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                style={
                  event.userRsvp === option.value
                    ? { backgroundColor: theme.colors.brandColor }
                    : undefined
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
