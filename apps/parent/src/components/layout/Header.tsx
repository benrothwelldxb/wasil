import React, { useEffect, useState } from 'react'
import { Menu, X, Bell, BookOpen, Mail, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'

interface HeaderProps {
  menuOpen: boolean
  onMenuToggle: () => void
}

export function Header({ menuOpen, onMenuToggle }: HeaderProps) {
  const { user } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  // Poll unread count every 30 seconds
  useEffect(() => {
    if (!user || user.role !== 'PARENT') return

    const fetchUnread = async () => {
      try {
        const result = await api.inbox.unreadCount()
        setUnreadCount(result.count)
      } catch {
        // Silently fail
      }
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user])

  if (!user) return null

  return (
    <div
      className="fixed top-0 right-0 z-50 safe-area-top"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="flex items-center gap-1 m-4"
        style={{
          pointerEvents: 'auto',
          float: 'right',
          background: 'rgba(255, 248, 244, 0.85)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          borderRadius: '20px',
          border: '1px solid rgba(240, 228, 230, 0.6)',
          padding: '4px',
          boxShadow: '0 2px 12px rgba(45, 34, 37, 0.06)',
        }}
      >
        {/* School logo */}
        {theme.logoIconUrl ? (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center justify-center"
            aria-label="Scroll to top"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '14px',
              padding: '2px',
            }}
          >
            <img
              src={theme.logoIconUrl}
              alt={theme.schoolName}
              style={{ height: '28px', width: '28px', borderRadius: '8px' }}
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/logo.png'
              }}
            />
          </button>
        ) : (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center justify-center"
            aria-label="Scroll to top"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '14px',
              backgroundColor: theme.colors.brandColor + '12',
            }}
          >
            <BookOpen style={{ height: '18px', width: '18px', color: theme.colors.brandColor }} />
          </button>
        )}

        {/* Search */}
        <button
          className="flex items-center justify-center"
          aria-label="Search"
          style={{
            minWidth: '44px',
            minHeight: '44px',
            borderRadius: '14px',
          }}
          onClick={() => navigate('/search')}
        >
          <Search className="h-[18px] w-[18px]" style={{ color: '#7A6469' }} />
        </button>

        {/* Inbox (direct messages) */}
        <button
          className="flex items-center justify-center"
          aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread messages` : 'Inbox'}
          style={{
            minWidth: '44px',
            minHeight: '44px',
            borderRadius: '14px',
            position: 'relative',
          }}
          onClick={() => navigate('/inbox')}
        >
          <Mail className="h-[18px] w-[18px]" style={{ color: '#7A6469' }} />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: unreadCount > 9 ? '18px' : '16px',
                height: '16px',
                borderRadius: '8px',
                backgroundColor: '#C4506E',
                color: '#FFFFFF',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Hamburger / Close */}
        <button
          onClick={onMenuToggle}
          className="flex items-center justify-center"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          style={{
            minWidth: '44px',
            minHeight: '44px',
            borderRadius: '14px',
          }}
        >
          {menuOpen ? (
            <X className="h-[18px] w-[18px]" style={{ color: '#7A6469' }} />
          ) : (
            <Menu className="h-[18px] w-[18px]" style={{ color: '#7A6469' }} />
          )}
        </button>
      </div>
    </div>
  )
}
