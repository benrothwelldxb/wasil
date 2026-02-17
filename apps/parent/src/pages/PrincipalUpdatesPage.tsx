import React, { useState } from 'react'
import { Heart, ArrowRight } from 'lucide-react'
import { useApi, useMutation } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

export function PrincipalUpdatesPage() {
  const theme = useTheme()
  const [selectedMessage, setSelectedMessage] = useState<WeeklyMessage | null>(null)

  const { data: messages, setData: setMessages, isLoading } = useApi<WeeklyMessage[]>(
    () => api.weeklyMessage.list(),
    []
  )

  const { mutate: toggleHeart } = useMutation(api.weeklyMessage.toggleHeart)

  const handleToggleHeart = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const result = await toggleHeart(messageId)
    setMessages((prev) =>
      prev?.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              hasHearted: result.hearted,
              heartCount: result.hearted ? msg.heartCount + 1 : msg.heartCount - 1,
            }
          : msg
      ) || null
    )
  }

  const formatWeekOf = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Principal info - could come from config or API
  const principalName = 'Ben Jones'
  const principalPhotoUrl = '/principal-photo.png'
  const initials = getInitials(principalName)

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
          Principal's Updates
        </h1>
        <p className="text-gray-600 mt-1">
          Weekly messages from {principalName.split(' ')[0]}, our Principal
        </p>
      </div>

      {/* Messages List */}
      <div className="space-y-4">
        {messages && messages.length > 0 ? (
          messages.map((message) => (
            <div
              key={message.id}
              onClick={() => setSelectedMessage(message)}
              className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              style={{
                border: message.isCurrent
                  ? `2px solid ${theme.colors.accentColor}`
                  : '1px solid #e5e7eb',
              }}
            >
              <div className="p-4 flex items-center">
                {/* Avatar */}
                <img
                  src={principalPhotoUrl}
                  alt={principalName}
                  className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.style.display = 'none'
                  }}
                />

                {/* Content */}
                <div className="ml-4 flex-1">
                  <div className="flex items-center space-x-2">
                    <h3
                      className="font-bold text-lg"
                      style={{ color: theme.colors.brandColor }}
                    >
                      {message.title}
                    </h3>
                    {message.isCurrent && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: theme.colors.accentColor }}
                      >
                        This Week
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm">
                    Week of {formatWeekOf(message.weekOf)}
                  </p>
                  <p
                    className="text-sm font-medium mt-1 flex items-center"
                    style={{ color: theme.colors.accentColor }}
                  >
                    Click to read <ArrowRight className="h-4 w-4 ml-1" />
                  </p>
                </div>

                {/* Heart Button */}
                <button
                  onClick={(e) => handleToggleHeart(message.id, e)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <Heart
                    className={`h-6 w-6 ${
                      message.hasHearted
                        ? 'fill-red-500 text-red-500'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <p className="text-gray-500">No updates available.</p>
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <img
                    src={principalPhotoUrl}
                    alt={principalName}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="ml-3">
                    <h3
                      className="text-xl font-bold"
                      style={{ color: theme.colors.brandColor }}
                    >
                      {selectedMessage.title}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Week of {formatWeekOf(selectedMessage.weekOf)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>

              {/* Content */}
              <div className="prose prose-sm max-w-none">
                {selectedMessage.content.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="text-gray-700 mb-3">
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={(e) => handleToggleHeart(selectedMessage.id, e)}
                  className="flex items-center space-x-2 text-gray-600 hover:text-red-500 transition-colors"
                >
                  <Heart
                    className={`h-6 w-6 ${
                      selectedMessage.hasHearted
                        ? 'fill-red-500 text-red-500'
                        : ''
                    }`}
                  />
                  <span className="font-medium">{selectedMessage.heartCount}</span>
                </button>
                <p className="text-sm text-gray-500">
                  {principalName}, Principal
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
