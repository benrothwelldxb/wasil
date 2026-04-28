import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ConversationListItem } from '@wasil/shared'
import { MessageSquare, Plus, ChevronRight, BellOff, MoreHorizontal, VolumeX, Volume2, Archive, Download } from 'lucide-react'

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function InboxPage() {
  const navigate = useNavigate()
  const { data: conversations, isLoading, setData: setConversations } = useApi<ConversationListItem[]>(
    () => api.inbox.conversations(),
    []
  )
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [openMenuId])

  // Silent poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fresh = await api.inbox.conversations()
        setConversations(fresh)
      } catch { /* silent */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [setConversations])

  const handleMute = async (convId: string, currentlyMuted: boolean) => {
    setOpenMenuId(null)
    try {
      await api.inbox.muteConversation(convId, !currentlyMuted)
      setConversations(prev =>
        prev ? prev.map(c => c.id === convId ? { ...c, muted: !currentlyMuted } : c) : prev
      )
    } catch (error) {
      console.error('Failed to mute conversation:', error)
    }
  }

  const handleArchive = async (convId: string) => {
    setOpenMenuId(null)
    try {
      await api.inbox.archiveConversation(convId)
      setConversations(prev => prev ? prev.filter(c => c.id !== convId) : prev)
    } catch (error) {
      console.error('Failed to archive conversation:', error)
    }
  }

  const handleExport = async (convId: string) => {
    setOpenMenuId(null)
    try {
      await api.inbox.exportConversation(convId)
    } catch (error) {
      console.error('Failed to export conversation:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#2D2225' }}>Inbox</h1>
        <button
          onClick={() => navigate('/inbox/new')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold"
          style={{ backgroundColor: '#C4506E' }}
        >
          <Plus className="w-4 h-4" />
          New Message
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-[22px] p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="skeleton-pulse w-11 h-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-pulse h-4 w-2/3 rounded" />
                  <div className="skeleton-pulse h-3 w-1/2 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: '#FFF0F3' }}
          >
            <MessageSquare className="w-7 h-7" style={{ color: '#C4506E' }} />
          </div>
          <div>
            <p className="font-semibold text-lg" style={{ color: '#2D2225' }}>No conversations yet</p>
            <p className="text-sm mt-1" style={{ color: '#7A6469' }}>
              Tap "New Message" to contact your child's teacher or school reception
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <div key={conv.id} className="relative">
              <div
                className="w-full text-left bg-white rounded-[22px] p-4 flex items-center gap-3 transition-all"
                style={{
                  border: conv.unreadCount > 0 ? '1.5px solid #C4506E20' : '1px solid #F0E4E6',
                }}
              >
                {/* Clickable area for navigation */}
                <button
                  onClick={() => navigate(`/inbox/${conv.id}`)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition-all"
                >
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{
                      backgroundColor: conv.schoolContactIcon ? '#FFF0F3' : '#F5EEF0',
                      color: '#C4506E',
                    }}
                  >
                    {conv.schoolContactIcon || getInitials(conv.staffName)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm truncate"
                        style={{
                          fontWeight: conv.unreadCount > 0 ? 700 : 500,
                          color: '#2D2225',
                        }}
                      >
                        {conv.schoolContactName || conv.staffName}
                      </span>
                      {conv.muted && (
                        <BellOff className="w-3.5 h-3.5 shrink-0" style={{ color: '#A8929A' }} />
                      )}
                      <span className="text-xs shrink-0" style={{ color: '#A8929A' }}>
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    {conv.studentName && (
                      <p className="text-xs mt-0.5" style={{ color: '#A8929A' }}>
                        About {conv.studentName}{conv.className ? ` — ${conv.className}` : ''}
                      </p>
                    )}
                    {conv.lastMessageText && (
                      <p
                        className="text-sm mt-0.5 truncate"
                        style={{
                          color: conv.unreadCount > 0 ? '#2D2225' : '#7A6469',
                          fontWeight: conv.unreadCount > 0 ? 600 : 400,
                        }}
                      >
                        {conv.lastMessageText}
                      </p>
                    )}
                  </div>
                </button>

                {/* Right side: unread badge / menu button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {conv.unreadCount > 0 && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
                      style={{ backgroundColor: '#C4506E' }}
                    >
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === conv.id ? null : conv.id)
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: openMenuId === conv.id ? '#F5EEF0' : 'transparent' }}
                  >
                    <MoreHorizontal className="w-4 h-4" style={{ color: '#A8929A' }} />
                  </button>
                </div>
              </div>

              {/* Dropdown menu */}
              {openMenuId === conv.id && (
                <div
                  ref={menuRef}
                  className="absolute right-4 top-12 z-50 bg-white rounded-2xl shadow-lg py-1.5 min-w-[160px]"
                  style={{ border: '1px solid #F0E4E6' }}
                >
                  <button
                    onClick={() => handleMute(conv.id, !!conv.muted)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm active:bg-gray-50 transition-colors"
                    style={{ color: '#2D2225' }}
                  >
                    {conv.muted ? (
                      <>
                        <Volume2 className="w-4 h-4" style={{ color: '#7A6469' }} />
                        Unmute
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4" style={{ color: '#7A6469' }} />
                        Mute
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleArchive(conv.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm active:bg-gray-50 transition-colors"
                    style={{ color: '#2D2225' }}
                  >
                    <Archive className="w-4 h-4" style={{ color: '#7A6469' }} />
                    Archive
                  </button>
                  <button
                    onClick={() => handleExport(conv.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm active:bg-gray-50 transition-colors"
                    style={{ color: '#2D2225' }}
                  >
                    <Download className="w-4 h-4" style={{ color: '#7A6469' }} />
                    Export
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
