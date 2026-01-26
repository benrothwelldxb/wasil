import React from 'react'
import { Calendar } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { ScheduleItem } from '../../types'

interface ScheduleWidgetProps {
  items: ScheduleItem[]
  date: string
}

// Class colors for demo - these would come from backend in production
const CLASS_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  'FS1 Blue': { bg: 'bg-blue-100', text: 'text-blue-700', hex: '#3b82f6' },
  'Y2 Red': { bg: 'bg-red-100', text: 'text-red-700', hex: '#ef4444' },
  'Y4 Green': { bg: 'bg-green-100', text: 'text-green-700', hex: '#22c55e' },
  'Whole School': { bg: 'bg-purple-100', text: 'text-purple-700', hex: '#7f0029' },
}

export function ScheduleWidget({ items, date }: ScheduleWidgetProps) {
  const theme = useTheme()

  const dateObj = new Date(date)
  const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
  })

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className="rounded-2xl shadow-sm overflow-hidden"
      style={{ backgroundColor: '#eff6ff', border: '2px solid #3b82f6' }}
    >
      {/* Blue Header */}
      <div className="px-5 py-3 flex items-center space-x-3" style={{ backgroundColor: '#3b82f6' }}>
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <Calendar className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-white text-lg">{dayName}'s Schedule</h3>
          <p className="text-blue-100 text-sm">{dateStr}</p>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-3">
        {items.map((item) => {
          const classColor = CLASS_COLORS[item.targetClass] || {
            bg: 'bg-gray-100',
            text: 'text-gray-700',
            hex: '#6b7280',
          }

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-blue-100"
            >
              <div className="flex items-start space-x-3">
                {item.icon && (
                  <span className="text-2xl">{item.icon}</span>
                )}
                <div className="flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {item.label}
                    </span>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={
                        item.targetClass === 'Whole School'
                          ? { backgroundColor: theme.colors.brandColor, color: 'white' }
                          : { backgroundColor: classColor.hex + '20', color: classColor.hex }
                      }
                    >
                      {item.targetClass}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-600">{item.description}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
