import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth, useApi, useMutation } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { WeeklyMessage } from '@wasil/shared'

export function PrincipalUpdatesPage() {
  const { user } = useAuth()
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
    // Also update selectedMessage if open
    if (selectedMessage?.id === messageId) {
      setSelectedMessage(prev =>
        prev ? { ...prev, hasHearted: result.hearted, heartCount: result.hearted ? prev.heartCount + 1 : prev.heartCount - 1 } : null
      )
    }
  }

  const formatWeekOf = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
    })
  }

  const formatWeekOfFull = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const getInitials = (title: string) => {
    return title
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const principalName = user?.school?.principalName || 'the Principal'
  const principalTitle = user?.school?.principalTitle || 'Principal'

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
          Principal's Updates
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          Weekly messages from {principalName}
        </p>
      </div>

      {/* Messages List */}
      <div className="space-y-3">
        {messages && messages.length > 0 ? (
          messages.map((message) => {
            const isCurrent = message.isCurrent

            return (
              <button
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                className="w-full text-left overflow-hidden transition-transform active:scale-[0.98]"
                style={{
                  borderRadius: '22px',
                  border: isCurrent ? '2px solid #C4506E' : '1.5px solid #F0E4E6',
                  backgroundColor: isCurrent ? '#FFF7F9' : '#FFFFFF',
                }}
              >
                <div className="p-[18px]">
                  {/* Header row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-[46px] h-[46px] rounded-full flex items-center justify-center text-white text-base font-extrabold flex-shrink-0"
                      style={{ backgroundColor: '#C4506E' }}
                    >
                      {getInitials(message.title)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-bold truncate" style={{ color: '#2D2225' }}>
                          {message.title}
                        </h3>
                        {isCurrent && (
                          <span
                            className="flex-shrink-0 px-2.5 py-0.5 rounded-lg text-[11px] font-bold"
                            style={{ backgroundColor: '#C4506E', color: '#FFFFFF' }}
                          >
                            This Week
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-semibold mt-0.5" style={{ color: '#A8929A' }}>
                        Week of {formatWeekOf(message.weekOf)}
                      </p>
                    </div>
                  </div>

                  {/* Preview text (only for current) */}
                  {isCurrent && message.content && (
                    <p
                      className="text-sm font-medium leading-relaxed mb-3"
                      style={{
                        color: '#7A6469',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {message.content}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => handleToggleHeart(message.id, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                      style={{
                        background: message.hasHearted ? 'rgba(224,85,119,0.08)' : 'transparent',
                        color: message.hasHearted ? '#E05577' : '#A8929A',
                        fontSize: '14px',
                        fontWeight: 700,
                        border: 'none',
                      }}
                    >
                      <span className="text-[20px]">
                        {message.hasHearted ? '\u2764\uFE0F' : '\u{1FA77}'}
                      </span>
                      <span>{message.heartCount}</span>
                    </button>

                    <span
                      className="text-[13px] font-bold"
                      style={{ color: '#C4506E' }}
                    >
                      Read {isCurrent ? 'full update' : ''} ›
                    </span>
                  </div>
                </div>
              </button>
            )
          })
        ) : (
          <div
            className="bg-white p-12 text-center"
            style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
          >
            <p className="font-medium" style={{ color: '#A8929A' }}>No updates available yet</p>
          </div>
        )}
      </div>

      {/* Detail Modal (bottom sheet style) */}
      {selectedMessage && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-auto"
            style={{
              borderRadius: '22px 22px 0 0',
              borderTop: '1.5px solid #F0E4E6',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E8DDE0' }} />
            </div>

            <div className="px-5 pb-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-lg font-extrabold flex-shrink-0"
                    style={{ backgroundColor: '#C4506E' }}
                  >
                    {getInitials(selectedMessage.title)}
                  </div>
                  <div>
                    <h3 className="text-[20px] font-extrabold leading-tight" style={{ color: '#2D2225' }}>
                      {selectedMessage.title}
                    </h3>
                    <p className="text-[13px] font-semibold mt-0.5" style={{ color: '#7A6469' }}>
                      {principalName} · Week of {formatWeekOfFull(selectedMessage.weekOf)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 mt-1"
                  style={{ color: '#A8929A' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Header image */}
              {selectedMessage.imageUrl && (
                <img
                  src={selectedMessage.imageUrl}
                  alt=""
                  className="w-full rounded-2xl mb-5 object-cover"
                  style={{ maxHeight: '240px' }}
                />
              )}

              {/* Content */}
              <div>
                {selectedMessage.content.split('\n').map((paragraph, idx) => (
                  paragraph.trim() ? (
                    <p key={idx} className="text-[15px] leading-[1.7] mb-4" style={{ color: '#4A3A40' }}>
                      {paragraph}
                    </p>
                  ) : <div key={idx} className="h-2" />
                ))}
              </div>

              {/* Footer */}
              <div
                className="mt-6 pt-4 flex items-center justify-between"
                style={{ borderTop: '1px solid #F0E4E6' }}
              >
                <button
                  onClick={(e) => handleToggleHeart(selectedMessage.id, e)}
                  className="flex items-center gap-2"
                  style={{
                    background: selectedMessage.hasHearted ? 'rgba(224,85,119,0.08)' : 'transparent',
                    color: selectedMessage.hasHearted ? '#E05577' : '#A8929A',
                    fontSize: '15px',
                    fontWeight: 700,
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span className="text-[22px]">
                    {selectedMessage.hasHearted ? '\u2764\uFE0F' : '\u{1FA77}'}
                  </span>
                  <span>{selectedMessage.heartCount}</span>
                </button>
                <p className="text-[13px] font-semibold" style={{ color: '#A8929A' }}>
                  {principalName}, {principalTitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
