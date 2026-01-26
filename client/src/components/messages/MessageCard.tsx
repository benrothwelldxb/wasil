import React from 'react'
import { ThumbsUp, Share2, AlertTriangle, Pin } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Message } from '../../types'

interface MessageCardProps {
  message: Message
  onAcknowledge?: (id: string) => void
  showAcknowledgeButton?: boolean
  classColors?: Record<string, { bg: string; hex: string }>
}

const CLASS_HEX_COLORS: Record<string, string> = {
  'FS1 Blue': '#3b82f6',
  'Y2 Red': '#ef4444',
  'Y4 Green': '#22c55e',
  'Whole School': '#7f0029',
}

export function MessageCard({
  message,
  onAcknowledge,
  showAcknowledgeButton = true,
  classColors = {},
}: MessageCardProps) {
  const theme = useTheme()

  const getActionBadge = () => {
    if (!message.actionType) return null

    const badges: Record<string, { label: string; bg: string; text: string }> = {
      consent: {
        label: message.actionLabel || 'Medical Form Required',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
      },
      payment: {
        label: message.actionLabel || 'Payment Due',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
      },
      rsvp: {
        label: message.actionLabel || 'RSVP Required',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
      },
    }

    const badge = badges[message.actionType] || badges.consent
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        <AlertTriangle className="h-4 w-4 mr-1" />
        {badge.label}
      </span>
    )
  }

  const headerColor = CLASS_HEX_COLORS[message.targetClass] || theme.colors.brandColor

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.toLocaleDateString('en-GB')}, ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`
  }

  const isUrgent = message.isUrgent
  const isPinned = message.isPinned

  return (
    <div
      className={`bg-white rounded-xl shadow-sm overflow-hidden ${
        isUrgent ? 'ring-2 ring-red-500 border-red-500' : 'border border-gray-100'
      }`}
    >
      {/* Urgent Banner */}
      {isUrgent && (
        <div className="bg-red-500 px-4 py-1.5 flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 text-white" />
          <span className="text-white text-sm font-semibold">Urgent Message</span>
        </div>
      )}

      {/* Colored Header */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ backgroundColor: headerColor }}
      >
        <div className="flex items-center space-x-2">
          {isPinned && (
            <Pin className="h-4 w-4 text-white opacity-80" style={{ transform: 'rotate(45deg)' }} />
          )}
          <span className="text-white text-sm font-medium">{message.targetClass}</span>
        </div>
        <button className="text-white opacity-80 hover:opacity-100">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title and Action Badge */}
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-lg">{message.title}</h3>
          {getActionBadge()}
        </div>

        {/* Due Date Box */}
        {message.actionDueDate && (
          <div
            className="mb-3 p-3 rounded-lg border-l-4"
            style={{
              backgroundColor: `${theme.colors.accentColor}15`,
              borderLeftColor: theme.colors.accentColor,
            }}
          >
            <span className="text-sm font-medium" style={{ color: theme.colors.brandColor }}>
              Due: {formatDate(message.actionDueDate)}
              {message.actionAmount && ` • ${message.actionAmount}`}
            </span>
          </div>
        )}

        {/* Message Content */}
        <p className="text-gray-700 mb-4">{message.content}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center space-x-4">
            {showAcknowledgeButton && onAcknowledge && !message.acknowledged && (
              <button
                onClick={() => onAcknowledge(message.id)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ThumbsUp className="h-4 w-4" />
                <span className="text-sm font-medium">Acknowledge</span>
              </button>
            )}
            {message.acknowledged && (
              <span className="flex items-center space-x-2 text-green-600 text-sm font-medium">
                <ThumbsUp className="h-4 w-4" />
                <span>Acknowledged</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-gray-400">
            <ThumbsUp className="h-4 w-4" />
            <span className="text-sm">{message.acknowledgmentCount || 0}</span>
          </div>
        </div>

        {/* Sender Info */}
        <p className="text-xs text-gray-500 mt-3">
          {message.senderName} • {formatTimestamp(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
