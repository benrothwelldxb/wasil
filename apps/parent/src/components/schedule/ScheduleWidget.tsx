import React from 'react'
import { Calendar } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { ScheduleItem } from '@wasil/shared'

interface ScheduleWidgetProps {
  items: ScheduleItem[]
  date: string
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
          // Brand color for whole school / year group; class color for single class
          const isSingleClass = !!item.classId
          const fallbackHex = '#6b7280'

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
                        isSingleClass
                          ? { backgroundColor: fallbackHex + '20', color: fallbackHex }
                          : { backgroundColor: theme.colors.brandColor, color: 'white' }
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
