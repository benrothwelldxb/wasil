import React from 'react'
import { Heart } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

interface WeeklyMessageCardProps {
  message: WeeklyMessage
  onHeart?: (id: string) => void
}

export function WeeklyMessageCard({ message, onHeart }: WeeklyMessageCardProps) {
  const theme = useTheme()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="px-4 py-3 text-white"
        style={{ backgroundColor: theme.colors.brandColor }}
      >
        <h3 className="font-semibold">{message.title}</h3>
        <p className="text-xs opacity-80">
          Week of {new Date(message.weekOf).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <div className="p-4">
        <div className="prose prose-sm max-w-none">
          {message.content.split('\n').map((paragraph, idx) => (
            <p key={idx} className="text-gray-700 mb-2">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={() => onHeart?.(message.id)}
          className={`flex items-center space-x-2 transition-colors ${
            message.hasHearted ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
          }`}
        >
          <Heart
            className={`h-5 w-5 ${message.hasHearted ? 'fill-current' : ''}`}
          />
          <span className="text-sm font-medium">{message.heartCount}</span>
        </button>
        {message.isCurrent && (
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{ backgroundColor: theme.colors.accentColor, color: theme.colors.brandColor }}
          >
            This Week
          </span>
        )}
      </div>
    </div>
  )
}
