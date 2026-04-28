import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ConversationDetail, ConversationMessageItem } from '@wasil/shared'
import { ArrowLeft, Send, Paperclip, Search, X, MoreVertical, Download, Reply, Trash2 } from 'lucide-react'

const REACTION_EMOJIS = [
  { key: 'thumbsup', emoji: '\u{1F44D}' },
  { key: 'heart', emoji: '\u{2764}\u{FE0F}' },
  { key: 'laugh', emoji: '\u{1F602}' },
  { key: 'sad', emoji: '\u{1F622}' },
  { key: 'check', emoji: '\u{2705}' },
]

const EMOJI_MAP: Record<string, string> = {
  thumbsup: '\u{1F44D}',
  heart: '\u{2764}\u{FE0F}',
  laugh: '\u{1F602}',
  sad: '\u{1F622}',
  check: '\u{2705}',
}

function formatMessageTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatReadAt(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) {
    return `Read at ${time}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `Read yesterday at ${time}`
  }
  const dateFormatted = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `Read ${dateFormatted} at ${time}`
}

function formatDateSeparator(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isToday) return 'Today'
  if (isYesterday) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shouldShowDateSeparator(currentMsg: string, prevMsg?: string) {
  if (!prevMsg) return true
  return new Date(currentMsg).toDateString() !== new Date(prevMsg).toDateString()
}

function canDeleteMessage(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime()
  return diff < 15 * 60 * 1000
}

export function ConversationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastTypedRef = useRef(0)
  const lastTypingSentRef = useRef(0)

  // Search state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ConversationMessageItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reply state
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null)

  // Message action states
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Header menu
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)

  // Refs for click-outside handling
  const actionBarRef = useRef<HTMLDivElement>(null)
  const reactionPickerRef = useRef<HTMLDivElement>(null)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { data: conversation, isLoading, setData: setConversation } = useApi<ConversationDetail>(
    () => api.inbox.conversation(id!),
    [id]
  )

  // Close overlays on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (activeMessageId && actionBarRef.current && !actionBarRef.current.contains(e.target as Node)) {
        setActiveMessageId(null)
      }
      if (reactionPickerMessageId && reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMessageId(null)
      }
      if (showHeaderMenu && headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activeMessageId, reactionPickerMessageId, showHeaderMenu])

  // Debounced search
  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !id) {
      setSearchResults([])
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await api.inbox.searchMessages(id, searchQuery.trim())
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, showSearch, id])

  // Poll typing indicator every 2 seconds
  useEffect(() => {
    if (!id) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/inbox/conversations/${id}/typing`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        })
        if (res.ok) {
          const data = await res.json()
          setOtherTyping(data.typing)
        }
      } catch { /* silent */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [id])

  // Send typing signal when user types
  const sendTypingSignal = () => {
    if (!id) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < 2000) return
    lastTypingSentRef.current = now
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/inbox/conversations/${id}/typing`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {})
  }

  // Silent poll every 5 seconds
  useEffect(() => {
    if (!id) return
    const interval = setInterval(async () => {
      if (Date.now() - lastTypedRef.current < 3000) return
      try {
        const fresh = await api.inbox.conversation(id)
        setConversation(prev => {
          if (!prev) return fresh
          if (fresh.messages.length === prev.messages.length &&
              fresh.messages[fresh.messages.length - 1]?.id === prev.messages[prev.messages.length - 1]?.id) {
            return prev
          }
          return fresh
        })
      } catch { /* silent */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [id, setConversation])

  // Scroll to bottom on new messages
  const prevMsgCount = useRef(0)
  useEffect(() => {
    const count = conversation?.messages?.length ?? 0
    if (count > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMsgCount.current = count
  }, [conversation?.messages?.length])

  const handleSend = async () => {
    if (!messageText.trim() || sending || !id) return

    setSending(true)
    try {
      const newMsg = await api.inbox.sendMessage(id, {
        content: messageText.trim(),
        replyToId: replyingTo?.id,
      })
      setMessageText('')
      setReplyingTo(null)
      setConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, newMsg],
      } : prev)
      inputRef.current?.focus()
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!id) return
    setDeleteConfirmId(null)
    setActiveMessageId(null)
    try {
      await api.inbox.deleteMessage(id, messageId)
      setConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === messageId ? { ...m, deleted: true, content: '' } : m
          ),
        }
      })
    } catch (error) {
      console.error('Failed to delete message:', error)
    }
  }

  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!id) return
    setReactionPickerMessageId(null)
    setActiveMessageId(null)

    const msg = conversation?.messages.find(m => m.id === messageId)
    const reactionInfo = msg?.reactions?.[emoji]
    const alreadyReacted = reactionInfo?.reacted ?? false

    try {
      if (alreadyReacted) {
        await api.inbox.removeReaction(id, messageId, emoji)
        setConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id !== messageId || !m.reactions) return m
              const updated = { ...m.reactions }
              if (updated[emoji]) {
                if (updated[emoji].count <= 1) {
                  delete updated[emoji]
                } else {
                  updated[emoji] = { count: updated[emoji].count - 1, reacted: false }
                }
              }
              return { ...m, reactions: updated }
            }),
          }
        })
      } else {
        await api.inbox.reactToMessage(id, messageId, emoji)
        setConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: prev.messages.map(m => {
              if (m.id !== messageId) return m
              const updated = { ...(m.reactions || {}) }
              if (updated[emoji]) {
                updated[emoji] = { count: updated[emoji].count + 1, reacted: true }
              } else {
                updated[emoji] = { count: 1, reacted: true }
              }
              return { ...m, reactions: updated }
            }),
          }
        })
      }
    } catch (error) {
      console.error('Failed to react:', error)
    }
  }, [id, conversation, setConversation])

  const handleExport = async () => {
    if (!id) return
    setShowHeaderMenu(false)
    try {
      await api.inbox.exportConversation(id)
    } catch (error) {
      console.error('Failed to export:', error)
    }
  }

  const scrollToMessage = (messageId: string) => {
    setSearchResults([])
    setShowSearch(false)
    setSearchQuery('')
    const el = messageRefs.current[messageId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'background-color 0.3s'
      el.style.backgroundColor = '#FFF0F3'
      setTimeout(() => { el.style.backgroundColor = 'transparent' }, 1500)
    }
  }

  const isOutgoing = (senderId: string) => senderId === user?.id

  const otherName = conversation
    ? (user?.role === 'PARENT'
      ? (conversation.schoolContactName || conversation.staffName)
      : conversation.parentName)
    : ''

  // Convert reactions Record to array for rendering
  const getReactionEntries = (reactions?: Record<string, { count: number; reacted: boolean }>) => {
    if (!reactions) return []
    return Object.entries(reactions).map(([emoji, info]) => ({
      emoji,
      count: info.count,
      userReacted: info.reacted,
    }))
  }

  return (
    <div className="fixed inset-0 bg-cream z-40 flex flex-col safe-area-top">
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingBottom: '12px',
          background: 'rgba(255, 248, 244, 0.92)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderBottom: '1px solid #F0E4E6',
        }}
      >
        <button
          onClick={() => navigate('/inbox')}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#2D2225' }}>
            {otherName}
          </p>
          {conversation?.studentName && (
            <p className="text-xs truncate" style={{ color: '#A8929A' }}>
              About {conversation.studentName}{conversation.className ? ` — ${conversation.className}` : ''}
            </p>
          )}
        </div>

        {/* Header actions */}
        <button
          onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); setSearchResults([]) }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: showSearch ? '#FFF0F3' : '#F5EEF0' }}
        >
          <Search className="w-4 h-4" style={{ color: showSearch ? '#C4506E' : '#7A6469' }} />
        </button>
        <div className="relative" ref={headerMenuRef}>
          <button
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: showHeaderMenu ? '#FFF0F3' : '#F5EEF0' }}
          >
            <MoreVertical className="w-4 h-4" style={{ color: showHeaderMenu ? '#C4506E' : '#7A6469' }} />
          </button>
          {showHeaderMenu && (
            <div
              className="absolute right-0 top-11 z-50 bg-white rounded-2xl shadow-lg py-1.5 min-w-[180px]"
              style={{ border: '1px solid #F0E4E6' }}
            >
              <button
                onClick={handleExport}
                className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-sm active:bg-gray-50 transition-colors"
                style={{ color: '#2D2225' }}
              >
                <Download className="w-4 h-4" style={{ color: '#7A6469' }} />
                Export Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div
          className="shrink-0 px-4 py-2 relative"
          style={{
            background: 'rgba(255, 248, 244, 0.92)',
            borderBottom: '1px solid #F0E4E6',
          }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6' }}
          >
            <Search className="w-4 h-4 shrink-0" style={{ color: '#A8929A' }} />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: '#2D2225' }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}>
                <X className="w-4 h-4" style={{ color: '#A8929A' }} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {searchQuery.trim() && (
            <div
              className="absolute left-4 right-4 top-full mt-1 bg-white rounded-2xl shadow-lg max-h-60 overflow-y-auto z-50"
              style={{ border: '1px solid #F0E4E6' }}
            >
              {searchLoading ? (
                <div className="px-4 py-3 text-sm" style={{ color: '#A8929A' }}>Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm" style={{ color: '#A8929A' }}>No messages found</div>
              ) : (
                searchResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => scrollToMessage(result.id)}
                    className="w-full text-left px-4 py-2.5 active:bg-gray-50 transition-colors"
                    style={{ borderBottom: '1px solid #F5EEF0' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: '#C4506E' }}>{result.senderName}</span>
                      <span className="text-[11px]" style={{ color: '#A8929A' }}>{formatMessageTime(result.createdAt)}</span>
                    </div>
                    <p className="text-sm mt-0.5 truncate" style={{ color: '#2D2225' }}>{result.content}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {isLoading ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className="skeleton-pulse rounded-2xl" style={{ width: '65%', height: '44px' }} />
              </div>
            ))}
          </div>
        ) : conversation?.messages && conversation.messages.length > 0 ? (
          conversation.messages.map((msg, idx) => {
            const outgoing = isOutgoing(msg.senderId)
            const showDate = shouldShowDateSeparator(
              msg.createdAt,
              idx > 0 ? conversation.messages[idx - 1].createdAt : undefined
            )
            const isLastOutgoing = outgoing && (
              idx === conversation.messages.length - 1 ||
              !conversation.messages.slice(idx + 1).some(m => isOutgoing(m.senderId))
            )
            const isDeleted = !!msg.deleted
            const reactions = getReactionEntries(msg.reactions)
            const isActive = activeMessageId === msg.id
            const showReactionPicker = reactionPickerMessageId === msg.id
            const deletable = outgoing && canDeleteMessage(msg.createdAt) && !isDeleted

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex justify-center py-3">
                    <span
                      className="text-xs font-medium px-3 py-1 rounded-full"
                      style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
                    >
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div
                  ref={el => { messageRefs.current[msg.id] = el }}
                  className={`flex ${outgoing ? 'justify-end' : 'justify-start'} mb-1 relative`}
                  style={{ borderRadius: '8px' }}
                >
                  <div style={{ maxWidth: '80%', position: 'relative' }}>
                    {/* Reply-to preview */}
                    {msg.replyTo && !isDeleted && (
                      <button
                        onClick={() => scrollToMessage(msg.replyTo!.id)}
                        className="w-full text-left mb-1 px-3 py-1.5 rounded-xl text-xs"
                        style={{
                          backgroundColor: outgoing ? '#F9E4EA' : '#F5EEF0',
                          borderLeft: '3px solid #C4506E',
                          color: '#7A6469',
                        }}
                      >
                        <span className="font-semibold" style={{ color: '#C4506E' }}>{msg.replyTo.senderName}</span>
                        <p className="truncate mt-0.5" style={{ color: '#7A6469' }}>
                          {msg.replyTo.deleted
                            ? 'This message was deleted'
                            : msg.replyTo.content.length > 60
                              ? msg.replyTo.content.slice(0, 60) + '...'
                              : msg.replyTo.content
                          }
                        </p>
                      </button>
                    )}

                    {/* Message bubble */}
                    {isDeleted ? (
                      <div
                        className="px-3.5 py-2.5 text-sm leading-relaxed italic"
                        style={{
                          borderRadius: outgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          backgroundColor: outgoing ? '#FAF0F2' : '#F8F5F6',
                          border: '1px solid #EDE4E6',
                          color: '#A8929A',
                          fontSize: '13px',
                        }}
                      >
                        This message was deleted
                      </div>
                    ) : (
                      <div
                        className="px-3.5 py-2.5 text-sm leading-relaxed cursor-pointer"
                        style={{
                          borderRadius: outgoing ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          backgroundColor: outgoing ? '#FFF0F3' : '#FFFFFF',
                          border: outgoing ? '1px solid #F5E0E5' : '1px solid #F0E4E6',
                          color: '#2D2225',
                          wordBreak: 'break-word',
                        }}
                        onClick={() => {
                          if (activeMessageId === msg.id) {
                            setActiveMessageId(null)
                          } else {
                            setActiveMessageId(msg.id)
                            setReactionPickerMessageId(null)
                          }
                        }}
                      >
                        {msg.content}
                      </div>
                    )}

                    {/* Attachments */}
                    {!isDeleted && msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {msg.attachments.map(att => (
                          <a
                            key={att.id}
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                            style={{
                              backgroundColor: outgoing ? '#FFF0F3' : '#FFFFFF',
                              border: '1px solid #F0E4E6',
                              color: '#C4506E',
                            }}
                          >
                            <Paperclip className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{att.fileName}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Reactions display */}
                    {!isDeleted && reactions.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                        {reactions.map(r => (
                          <button
                            key={r.emoji}
                            onClick={() => handleReaction(msg.id, r.emoji)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs"
                            style={{
                              backgroundColor: r.userReacted ? '#FFF0F3' : '#F5EEF0',
                              border: r.userReacted ? '1px solid #C4506E40' : '1px solid #E8E0E3',
                            }}
                          >
                            <span>{EMOJI_MAP[r.emoji] || r.emoji}</span>
                            <span style={{ color: r.userReacted ? '#C4506E' : '#7A6469', fontSize: '11px' }}>{r.count}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => setReactionPickerMessageId(msg.id)}
                          className="flex items-center justify-center w-6 h-6 rounded-full text-xs"
                          style={{ backgroundColor: '#F5EEF0', border: '1px solid #E8E0E3', color: '#A8929A' }}
                        >
                          +
                        </button>
                      </div>
                    )}

                    {/* Timestamp + read receipt */}
                    <div className={`flex items-center gap-1.5 mt-0.5 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[11px]" style={{ color: '#A8929A' }}>
                        {formatMessageTime(msg.createdAt)}
                      </span>
                      {isLastOutgoing && msg.readAt && (
                        <span className="text-[11px] font-medium" style={{ color: '#C4506E' }}>
                          {formatReadAt(msg.readAt)}
                        </span>
                      )}
                    </div>

                    {/* Floating action bar */}
                    {isActive && !isDeleted && (
                      <div
                        ref={actionBarRef}
                        className="absolute z-50 flex items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-1.5"
                        style={{
                          border: '1px solid #F0E4E6',
                          [outgoing ? 'left' : 'right']: '0',
                          bottom: '100%',
                          marginBottom: '4px',
                        }}
                      >
                        <button
                          onClick={() => {
                            setReplyingTo({ id: msg.id, senderName: msg.senderName, content: msg.content })
                            setActiveMessageId(null)
                            inputRef.current?.focus()
                          }}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium active:bg-gray-50 transition-colors"
                          style={{ color: '#2D2225' }}
                        >
                          <Reply className="w-3.5 h-3.5" style={{ color: '#7A6469' }} />
                          Reply
                        </button>
                        <button
                          onClick={() => {
                            setReactionPickerMessageId(msg.id)
                            setActiveMessageId(null)
                          }}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium active:bg-gray-50 transition-colors"
                          style={{ color: '#2D2225' }}
                        >
                          <span className="text-sm">{'\u{1F44D}'}</span>
                          React
                        </button>
                        {deletable && (
                          <button
                            onClick={() => {
                              setDeleteConfirmId(msg.id)
                              setActiveMessageId(null)
                            }}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium active:bg-gray-50 transition-colors"
                            style={{ color: '#D94444' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                        {outgoing && !canDeleteMessage(msg.createdAt) && !isDeleted && (
                          <span
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs"
                            style={{ color: '#C8B8BC' }}
                            title="Can't delete after 15 minutes"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </span>
                        )}
                      </div>
                    )}

                    {/* Reaction picker popover */}
                    {showReactionPicker && !isDeleted && (
                      <div
                        ref={reactionPickerRef}
                        className="absolute z-50 flex items-center gap-1 bg-white rounded-2xl shadow-lg px-2 py-1.5"
                        style={{
                          border: '1px solid #F0E4E6',
                          [outgoing ? 'left' : 'right']: '0',
                          bottom: '100%',
                          marginBottom: '4px',
                        }}
                      >
                        {REACTION_EMOJIS.map(({ key, emoji }) => {
                          const isUserReacted = msg.reactions?.[key]?.reacted ?? false
                          return (
                            <button
                              key={key}
                              onClick={() => handleReaction(msg.id, key)}
                              className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:scale-110 transition-transform"
                              style={{
                                backgroundColor: isUserReacted ? '#FFF0F3' : 'transparent',
                                border: isUserReacted ? '1.5px solid #C4506E40' : 'none',
                              }}
                            >
                              {emoji}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            )
          })
        ) : (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: '#A8929A' }}>
              Start the conversation by sending a message below
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setDeleteConfirmId(null)}>
          <div
            className="bg-white rounded-2xl p-5 mx-6 max-w-sm w-full shadow-xl"
            style={{ border: '1px solid #F0E4E6' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: '#2D2225' }}>Delete this message?</h3>
            <p className="text-sm mb-5" style={{ color: '#7A6469' }}>
              Recipients will see "This message was deleted". You can only delete messages within 15 minutes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMessage(deleteConfirmId)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: '#D94444' }}
              >
                Delete for everyone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Typing indicator */}
      {otherTyping && (
        <div className="px-5 py-1.5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#A8929A', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#A8929A', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#A8929A', animationDelay: '300ms' }} />
            </div>
            <span className="text-xs" style={{ color: '#A8929A' }}>
              {otherName} is typing...
            </span>
          </div>
        </div>
      )}

      {/* Reply preview bar */}
      {replyingTo && (
        <div
          className="shrink-0 px-4 py-2 flex items-center gap-3"
          style={{
            background: 'rgba(255, 248, 244, 0.95)',
            borderTop: '1px solid #F0E4E6',
          }}
        >
          <div
            className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs"
            style={{
              backgroundColor: '#FFF0F3',
              borderLeft: '3px solid #C4506E',
            }}
          >
            <span className="font-semibold" style={{ color: '#C4506E' }}>
              Replying to {replyingTo.senderName}
            </span>
            <p className="truncate mt-0.5" style={{ color: '#7A6469' }}>
              {replyingTo.content.length > 60 ? replyingTo.content.slice(0, 60) + '...' : replyingTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#F5EEF0' }}
          >
            <X className="w-4 h-4" style={{ color: '#7A6469' }} />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div
        className="shrink-0 px-3 pb-3"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          background: 'rgba(255, 248, 244, 0.92)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderTop: replyingTo ? 'none' : '1px solid #F0E4E6',
        }}
      >
        <div
          className="flex items-end gap-2 mt-2 rounded-2xl px-3 py-2"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #F0E4E6',
          }}
        >
          <textarea
            ref={inputRef}
            value={messageText}
            onChange={(e) => { lastTypedRef.current = Date.now(); sendTypingSignal(); setMessageText(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none"
            style={{
              color: '#2D2225',
              minHeight: '24px',
              maxHeight: '100px',
              lineHeight: '1.5',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all"
            style={{
              backgroundColor: messageText.trim() ? '#C4506E' : '#F0E4E6',
            }}
          >
            <Send
              className="w-4 h-4"
              style={{ color: messageText.trim() ? '#FFFFFF' : '#A8929A' }}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
