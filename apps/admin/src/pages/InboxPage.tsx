import React, { useState, useEffect, useRef } from 'react'
import { useAuth, useApi, useToast } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ConversationListItem, ConversationDetail, ConversationMessageItem, SchoolContactInfo, MessageSearchResult } from '@wasil/shared'
import type { Class } from '@wasil/shared'
import { MessageSquare, Send, ArrowLeft, Plus, ChevronRight, Paperclip, Settings, X, BellOff, MoreHorizontal, Reply, Trash2, Search } from 'lucide-react'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatMessageTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatReadAtTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `Read at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }
  return `Read ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

function formatDateSeparator(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function canDeleteMessage(msg: ConversationMessageItem, userId?: string) {
  if (!userId || msg.senderId !== userId) return false
  if (msg.deleted) return false
  const fifteenMinutes = 15 * 60 * 1000
  return Date.now() - new Date(msg.createdAt).getTime() < fifteenMinutes
}

export function StaffInboxPage() {
  const { user } = useAuth()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<string>('')
  const [showContacts, setShowContacts] = useState(false)

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  // Clear selected conversation when class filter changes
  useEffect(() => {
    setSelectedConversationId(null)
  }, [classFilter])

  const { data: conversations, isLoading, setData: setConversations } = useApi<ConversationListItem[]>(
    () => api.inbox.staffConversations(classFilter || undefined),
    [classFilter]
  )

  const { data: classes } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )

  // Silent poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fresh = await api.inbox.staffConversations(classFilter || undefined)
        setConversations(fresh)
      } catch { /* silent */ }
    }, 30000)
    return () => clearInterval(interval)
  }, [classFilter, setConversations])

  const handleMuteConversation = async (convId: string, currentMuted: boolean) => {
    try {
      await api.inbox.muteConversation(convId, !currentMuted)
      setConversations(prev =>
        prev ? prev.map(c => c.id === convId ? { ...c, muted: !currentMuted } : c) : prev
      )
    } catch { /* silent */ }
  }

  const handleExportConversation = async (convId: string) => {
    try {
      await api.inbox.exportConversation(convId)
    } catch { /* silent */ }
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900">Inbox</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowContacts(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Contacts
            </button>
          )}
        </div>
      </div>

      {/* Class filter tabs */}
      {classes && classes.length > 0 && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-100 overflow-x-auto">
          <button
            onClick={() => setClassFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !classFilter ? 'text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
            style={!classFilter ? { backgroundColor: '#C4506E' } : undefined}
          >
            All
          </button>
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => setClassFilter(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                classFilter === c.id ? 'text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
              style={classFilter === c.id ? { backgroundColor: '#C4506E' } : undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: conversation list */}
        <div className={`${selectedConversationId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[380px] border-r border-slate-100`}>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                    <div className="skeleton-pulse w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton-pulse h-3.5 w-2/3 rounded" />
                      <div className="skeleton-pulse h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !conversations || conversations.length === 0 ? (
              <div className="text-center py-16 px-6">
                <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No conversations yet</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {conversations.map(conv => (
                  <ConversationListRow
                    key={conv.id}
                    conv={conv}
                    isSelected={selectedConversationId === conv.id}
                    onSelect={() => setSelectedConversationId(conv.id)}
                    onMute={() => handleMuteConversation(conv.id, !!conv.muted)}
                    onExport={() => handleExportConversation(conv.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: conversation thread */}
        <div className={`${selectedConversationId ? 'flex' : 'hidden md:flex'} flex-col flex-1`}>
          {selectedConversationId ? (
            <ConversationThread
              conversationId={selectedConversationId}
              onBack={() => setSelectedConversationId(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* School Contacts Modal */}
      {showContacts && (
        <SchoolContactsModal onClose={() => setShowContacts(false)} />
      )}
    </div>
  )
}

/* ─── Conversation list row with mute indicator + dropdown ─── */

function ConversationListRow({
  conv,
  isSelected,
  onSelect,
  onMute,
  onExport,
}: {
  conv: ConversationListItem
  isSelected: boolean
  onSelect: () => void
  onMute: () => void
  onExport: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-colors ${
          isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
        }`}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ backgroundColor: '#F5EEF0', color: '#C4506E' }}
        >
          {getInitials(conv.parentName || '')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
              {conv.parentName}
              {conv.muted && <BellOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            </span>
            <span className="text-[11px] text-slate-400 shrink-0">
              {formatTime(conv.lastMessageAt)}
            </span>
          </div>
          {conv.studentName && (
            <p className="text-xs text-slate-400 truncate">
              {conv.studentName}{conv.className ? ` — ${conv.className}` : ''}
              {conv.schoolContactName ? ` (via ${conv.schoolContactName})` : ''}
            </p>
          )}
          {conv.lastMessageText && (
            <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
              {conv.lastMessageText}
            </p>
          )}
        </div>
        {conv.unreadCount > 0 && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ backgroundColor: '#C4506E' }}
          >
            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
          </div>
        )}
      </button>

      {/* "..." dropdown trigger */}
      <div ref={menuRef} className="absolute right-2 top-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[140px]">
            <button
              onClick={(e) => { e.stopPropagation(); onMute(); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <BellOff className="w-3.5 h-3.5" />
              {conv.muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); setMenuOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Conversation thread ─── */

function ConversationThread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ConversationMessageItem | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MessageSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastTypedRef = useRef(0)
  const lastTypingSentRef = useRef(0)
  const reactionPickerRef = useRef<HTMLDivElement>(null)

  const { data: conversation, isLoading, setData: setConversation } = useApi<ConversationDetail>(
    () => api.inbox.conversation(conversationId),
    [conversationId]
  )

  // Reset reply state when switching conversations
  useEffect(() => {
    setReplyingTo(null)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults(null)
  }, [conversationId])

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerMsgId) return
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerMsgId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reactionPickerMsgId])

  // Poll typing indicator
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/inbox/conversations/${conversationId}/typing`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        })
        if (res.ok) {
          const data = await res.json()
          setOtherTyping(data.typing)
        }
      } catch { /* silent */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [conversationId])

  const sendTypingSignal = () => {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 2000) return
    lastTypingSentRef.current = now
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/inbox/conversations/${conversationId}/typing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  // Silent poll every 5 seconds — only update state if messages changed
  useEffect(() => {
    const interval = setInterval(async () => {
      if (Date.now() - lastTypedRef.current < 3000) return
      try {
        const fresh = await api.inbox.conversation(conversationId)
        setConversation(prev => {
          if (!prev) return fresh
          if (fresh.messages.length === prev.messages.length &&
              fresh.messages[fresh.messages.length - 1]?.id === prev.messages[prev.messages.length - 1]?.id) {
            return prev // no change, keep same reference
          }
          return fresh
        })
      } catch { /* silent */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [conversationId, setConversation])

  const prevMsgCount = useRef(0)
  useEffect(() => {
    const count = conversation?.messages?.length ?? 0
    if (count > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMsgCount.current = count
  }, [conversation?.messages?.length])

  const handleSend = async () => {
    if (!messageText.trim() || sending) return
    setSending(true)
    try {
      const payload: { content: string; replyToId?: string } = { content: messageText.trim() }
      if (replyingTo) payload.replyToId = replyingTo.id
      const newMsg = await api.inbox.sendMessage(conversationId, payload)
      setMessageText('')
      setReplyingTo(null)
      setConversation(prev => prev ? { ...prev, messages: [...prev.messages, newMsg] } : prev)
    } catch (error) {
      toast.error('Failed to send message')
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

  const handleDeleteMessage = async (msg: ConversationMessageItem) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    try {
      await api.inbox.deleteMessage(conversationId, msg.id)
      setConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map(m =>
            m.id === msg.id ? { ...m, deleted: true, content: '' } : m
          ),
        }
      })
      toast.success('Message deleted')
    } catch {
      toast.error('Failed to delete message')
    }
  }

  const handleReaction = async (msgId: string, emoji: string, alreadyReacted: boolean) => {
    try {
      if (alreadyReacted) {
        await api.inbox.removeReaction(conversationId, msgId, emoji)
      } else {
        await api.inbox.reactToMessage(conversationId, msgId, emoji)
      }
      // Optimistically update
      setConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map(m => {
            if (m.id !== msgId) return m
            const reactions = { ...(m.reactions || {}) }
            if (alreadyReacted) {
              if (reactions[emoji]) {
                if (reactions[emoji].count <= 1) {
                  delete reactions[emoji]
                } else {
                  reactions[emoji] = { count: reactions[emoji].count - 1, reacted: false }
                }
              }
            } else {
              if (reactions[emoji]) {
                reactions[emoji] = { count: reactions[emoji].count + 1, reacted: true }
              } else {
                reactions[emoji] = { count: 1, reacted: true }
              }
            }
            return { ...m, reactions }
          }),
        }
      })
      setReactionPickerMsgId(null)
    } catch {
      toast.error('Failed to update reaction')
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await api.inbox.searchMessages(conversationId, searchQuery.trim())
      setSearchResults(results)
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
    if (e.key === 'Escape') {
      setShowSearch(false)
      setSearchQuery('')
      setSearchResults(null)
    }
  }

  const isOutgoing = (senderId: string) => senderId === user?.id

  return (
    <>
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <button
          onClick={onBack}
          className="md:hidden w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {conversation?.parentName}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {conversation?.studentName && `About ${conversation.studentName}`}
            {conversation?.className && ` — ${conversation.className}`}
            {conversation?.schoolContactName && ` (via ${conversation.schoolContactName})`}
          </p>
        </div>
        <button
          onClick={() => { setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setSearchResults(null) } }}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 shrink-0"
        >
          <Search className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search messages..."
              autoFocus
              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#C4506E' }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults(null) }}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          {searchResults !== null && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No results found</p>
              ) : (
                searchResults.map(r => (
                  <div key={r.id} className="px-3 py-2 rounded-lg bg-slate-50 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{r.senderName}</span>
                      <span className="text-slate-400">{formatMessageTime(r.createdAt)}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5 line-clamp-2">{r.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                <div className="skeleton-pulse rounded-2xl" style={{ width: '60%', height: '40px' }} />
              </div>
            ))}
          </div>
        ) : conversation?.messages?.map((msg, idx) => {
          const outgoing = isOutgoing(msg.senderId)
          const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !==
            new Date(conversation.messages[idx - 1].createdAt).toDateString()
          const isHovered = hoveredMsgId === msg.id
          const deletable = canDeleteMessage(msg, user?.id)

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="flex justify-center py-2">
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                    {formatDateSeparator(msg.createdAt)}
                  </span>
                </div>
              )}
              <div
                className={`flex ${outgoing ? 'justify-end' : 'justify-start'} mb-1 group/msg`}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => { setHoveredMsgId(null); if (reactionPickerMsgId === msg.id) setReactionPickerMsgId(null) }}
              >
                {/* Action buttons for outgoing (left side) */}
                {outgoing && isHovered && !msg.deleted && (
                  <div className="flex items-center gap-0.5 mr-1 self-center">
                    {deletable && (
                      <button
                        onClick={() => handleDeleteMessage(msg)}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-xs"
                        title="React"
                      >
                        😊
                      </button>
                      {reactionPickerMsgId === msg.id && (
                        <div ref={reactionPickerRef} className="absolute bottom-8 right-0 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1 flex gap-1 z-20">
                          {REACTION_EMOJIS.map(emoji => {
                            const existing = msg.reactions?.[emoji]
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji, !!existing?.reacted)}
                                className={`w-7 h-7 rounded flex items-center justify-center text-sm hover:bg-slate-100 ${existing?.reacted ? 'bg-slate-100' : ''}`}
                              >
                                {emoji}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ maxWidth: '75%' }}>
                  {/* Reply preview */}
                  {msg.replyTo && !msg.deleted && (
                    <div
                      className={`mb-1 px-3 py-1.5 rounded-lg text-xs ${outgoing ? 'ml-auto' : ''}`}
                      style={{
                        borderLeft: '3px solid #C4506E',
                        backgroundColor: '#F8F4F5',
                        maxWidth: '100%',
                      }}
                    >
                      <p className="font-medium text-slate-600" style={{ color: '#C4506E' }}>
                        {msg.replyTo.senderName}
                      </p>
                      <p className="text-slate-500 truncate">
                        {msg.replyTo.deleted
                          ? 'Original message was deleted'
                          : msg.replyTo.content.length > 80
                            ? msg.replyTo.content.slice(0, 80) + '...'
                            : msg.replyTo.content}
                      </p>
                    </div>
                  )}

                  {/* Message bubble */}
                  {msg.deleted ? (
                    <div
                      className="px-3.5 py-2 text-sm leading-relaxed italic text-slate-400"
                      style={{
                        borderRadius: outgoing ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        backgroundColor: '#F1F5F9',
                      }}
                    >
                      This message was deleted
                    </div>
                  ) : (
                    <div
                      className="px-3.5 py-2 text-sm leading-relaxed"
                      style={{
                        borderRadius: outgoing ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        backgroundColor: outgoing ? '#C4506E' : '#F1F5F9',
                        color: outgoing ? '#FFFFFF' : '#1E293B',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* Attachments */}
                  {!msg.deleted && msg.attachments?.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {msg.attachments.map(att => (
                        <a
                          key={att.id}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span className="truncate">{att.fileName}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Reactions */}
                  {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(msg.reactions).map(([emoji, r]) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(msg.id, emoji, r.reacted)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            r.reacted
                              ? 'border-pink-200 bg-pink-50 text-slate-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="font-medium">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp + read receipt */}
                  <p className={`text-[11px] mt-0.5 ${outgoing ? 'text-right' : 'text-left'} text-slate-400`}>
                    {formatMessageTime(msg.createdAt)}
                    {outgoing && msg.readAt && (
                      <span className="ml-1 font-medium" style={{ color: '#C4506E' }}>
                        {formatReadAtTime(msg.readAt)}
                      </span>
                    )}
                  </p>
                </div>

                {/* Action buttons for incoming (right side) */}
                {!outgoing && isHovered && !msg.deleted && (
                  <div className="flex items-center gap-0.5 ml-1 self-center">
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-xs"
                        title="React"
                      >
                        😊
                      </button>
                      {reactionPickerMsgId === msg.id && (
                        <div ref={reactionPickerRef} className="absolute bottom-8 left-0 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1 flex gap-1 z-20">
                          {REACTION_EMOJIS.map(emoji => {
                            const existing = msg.reactions?.[emoji]
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji, !!existing?.reacted)}
                                className={`w-7 h-7 rounded flex items-center justify-center text-sm hover:bg-slate-100 ${existing?.reacted ? 'bg-slate-100' : ''}`}
                              >
                                {emoji}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </React.Fragment>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {otherTyping && (
        <div className="px-4 py-1.5 flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-slate-400" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-slate-400" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-slate-400" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-slate-400">
            {conversation?.parentName || 'Someone'} is typing...
          </span>
        </div>
      )}

      {/* Reply preview bar */}
      {replyingTo && (
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 bg-slate-50">
          <div
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs"
            style={{ borderLeft: '3px solid #C4506E', backgroundColor: '#F8F4F5' }}
          >
            <p className="font-medium" style={{ color: '#C4506E' }}>
              Replying to {replyingTo.senderName}
            </p>
            <p className="text-slate-500 truncate">
              {replyingTo.deleted
                ? 'Original message was deleted'
                : replyingTo.content.length > 100
                  ? replyingTo.content.slice(0, 100) + '...'
                  : replyingTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200 shrink-0"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-end gap-2 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
          <textarea
            value={messageText}
            onChange={(e) => { lastTypedRef.current = Date.now(); sendTypingSignal(); setMessageText(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none text-slate-900"
            style={{ minHeight: '24px', maxHeight: '100px', lineHeight: '1.5' }}
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sending}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
            style={{
              backgroundColor: messageText.trim() ? '#C4506E' : '#E2E8F0',
            }}
          >
            <Send className="w-4 h-4" style={{ color: messageText.trim() ? '#FFFFFF' : '#94A3B8' }} />
          </button>
        </div>
      </div>
    </>
  )
}

function SchoolContactsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { data: contacts, refetch } = useApi<SchoolContactInfo[]>(
    () => api.inbox.contacts(),
    []
  )
  const { data: staffList } = useApi<any[]>(
    () => api.staff.list(),
    []
  )

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = () => {
    setName('')
    setDescription('')
    setIcon('')
    setAssignedUserId('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (contact: SchoolContactInfo) => {
    setName(contact.name)
    setDescription(contact.description || '')
    setIcon(contact.icon || '')
    setAssignedUserId(contact.assignedUserId)
    setEditingId(contact.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!name || !assignedUserId) return
    setSaving(true)
    try {
      if (editingId) {
        await api.inbox.updateContact(editingId, { name, description, icon, assignedUserId })
      } else {
        await api.inbox.createContact({ name, description, icon, assignedUserId })
      }
      refetch()
      resetForm()
    } catch (error) {
      toast.error('Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Archive this school contact?')) return
    try {
      await api.inbox.deleteContact(id)
      refetch()
    } catch (error) {
      toast.error('Failed to archive contact')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">School Contacts</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing contacts */}
          {contacts && contacts.filter(c => !c.archived).map(contact => (
            <div key={contact.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: '#FFF0F3' }}>
                {contact.icon || '📞'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{contact.name}</p>
                <p className="text-xs text-slate-500">Assigned to: {contact.assignedUserName}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(contact)}
                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(contact.id)}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-600 rounded"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}

          {/* Add/Edit form */}
          {showForm ? (
            <div className="space-y-3 p-4 rounded-xl border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">
                {editingId ? 'Edit Contact' : 'New Contact'}
              </h3>
              <input
                type="text"
                placeholder="Name (e.g., Reception)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
              />
              <input
                type="text"
                placeholder="Icon emoji (optional, e.g., 📞)"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
              />
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
              >
                <option value="">Select staff member...</option>
                {staffList?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!name || !assignedUserId || saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#C4506E' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              <Plus className="w-4 h-4" />
              Add School Contact
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
