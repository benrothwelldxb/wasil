import React from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, ArrowRight } from 'lucide-react'
import { useTheme } from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

interface WeeklyMessagePreviewProps {
  message: WeeklyMessage
  onHeart?: (id: string) => void
  onClick?: () => void
}

export function WeeklyMessagePreview({ message, onHeart, onClick }: WeeklyMessagePreviewProps) {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const locale = i18n.language || 'en'

  // Principal photo URL - can be made configurable via backend later
  const principalPhotoUrl = '/principal-photo.png'
  const initials = 'BJ' // Fallback initials

  return (
    <div
      className="rounded-xl shadow-md p-4 border-l-4"
      style={{
        borderLeftColor: theme.colors.brandColor,
        backgroundColor: `${theme.colors.accentColor}15`,
        border: `1px solid ${theme.colors.accentColor}40`,
        borderLeftWidth: '4px',
      }}
    >
      <div className="flex items-center space-x-4">
        {/* Avatar */}
        {principalPhotoUrl ? (
          <img
            src={principalPhotoUrl}
            alt="Principal"
            className="w-14 h-14 rounded-full object-cover flex-shrink-0"
            onError={(e) => {
              // Hide image and show fallback on error
              e.currentTarget.style.display = 'none'
              const fallback = e.currentTarget.nextElementSibling as HTMLElement
              if (fallback) fallback.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className="w-14 h-14 rounded-full items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{
            backgroundColor: theme.colors.brandColor,
            display: principalPhotoUrl ? 'none' : 'flex'
          }}
        >
          {initials}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold" style={{ color: theme.colors.brandColor }}>
            {message.title}
          </h3>
          <p className="text-sm text-gray-600">
            {t('principal.weekOf', { date: new Date(message.weekOf).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }) })}
          </p>
          <button
            onClick={onClick}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1 mt-1"
          >
            <span>{t('principal.clickToRead')}</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onHeart?.(message.id)
          }}
          className={`p-2 rounded-full transition-colors ${
            message.hasHearted
              ? 'text-red-500'
              : 'text-gray-300 hover:text-red-400'
          }`}
        >
          <Heart className={`h-6 w-6 ${message.hasHearted ? 'fill-current' : ''}`} />
        </button>
      </div>
    </div>
  )
}
