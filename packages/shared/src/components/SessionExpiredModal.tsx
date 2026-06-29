import React, { useEffect, useState } from 'react'
import { SESSION_EXPIRED_EVENT, clearTokens } from '../services/api'

interface SessionExpiredModalProps {
  /**
   * Path to redirect to when the user clicks "Sign in again".
   * Defaults to "/login".
   */
  loginPath?: string
  /**
   * Brand colour used on the primary button. Defaults to warm rose.
   */
  brandColor?: string
}

/**
 * Listens for SESSION_EXPIRED_EVENT and renders a Gmail-style overlay prompting
 * the user to re-authenticate. The current view stays mounted underneath so the
 * user doesn't lose context.
 */
export function SessionExpiredModal({
  loginPath = '/login',
  brandColor = '#C4506E',
}: SessionExpiredModalProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(SESSION_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler)
  }, [])

  const handleSignIn = () => {
    // Clear tokens locally — we deliberately don't call the server logout endpoint
    // here because the session is already invalid and a 401 would re-trigger
    // this modal mid-handoff. The browser navigation below leaves this view.
    clearTokens()
    window.location.href = loginPath
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '22px',
          maxWidth: '420px',
          width: '100%',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: `${brandColor}1A`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={brandColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <h2
          id="session-expired-title"
          style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}
        >
          Your session has expired
        </h2>
        <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 22px', lineHeight: 1.5 }}>
          For your security, you've been signed out. Sign in again to continue where you left off.
        </p>
        <button
          onClick={handleSignIn}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '14px',
            backgroundColor: brandColor,
            color: 'white',
            fontSize: '14px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign in again
        </button>
      </div>
    </div>
  )
}
