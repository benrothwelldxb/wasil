import React, { useEffect, useState } from 'react'
import { users } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface ContactConfirmModalProps {
  /** Brand colour for the confirm button. Defaults to warm rose. */
  brandColor?: string
}

/**
 * Asks parents to confirm or update their mobile number. The modal is
 * non-dismissable — the parent must confirm "yes, still mine" or supply a
 * new number. Schools that don't want this can set School.contactConfirmDays
 * to 0; the prompt endpoint then always returns `needsConfirmation: false`.
 *
 * Mount once at the parent app root. The modal polls
 * `GET /api/users/me/contact-prompt` once when the user is authenticated and
 * shows itself when needed; it disappears on successful confirm.
 */
export function ContactConfirmModal({
  brandColor = '#C4506E',
}: ContactConfirmModalProps) {
  const { user, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [existingPhone, setExistingPhone] = useState<string | null>(null)
  const [mode, setMode] = useState<'confirm' | 'edit'>('confirm')
  const [phoneInput, setPhoneInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only parents see this. Staff and admins are excluded server-side too.
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'PARENT') return
    let cancelled = false
    users.contactPrompt()
      .then(prompt => {
        if (cancelled) return
        if (!prompt.needsConfirmation) return
        setExistingPhone(prompt.phone)
        setPhoneInput(prompt.phone ?? '')
        // No phone yet → straight to edit mode. Existing phone → confirm mode.
        setMode(prompt.phone ? 'confirm' : 'edit')
        setOpen(true)
      })
      .catch(() => { /* network blip — don't block the app */ })
    return () => { cancelled = true }
  }, [isAuthenticated, user])

  const handleConfirmExisting = async () => {
    if (!existingPhone) return
    setSubmitting(true)
    setError(null)
    try {
      await users.confirmContact(existingPhone)
      setOpen(false)
    } catch (err: any) {
      setError(err.message || 'Could not save')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitNew = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await users.confirmContact(phoneInput.trim())
      setExistingPhone(result.phone)
      setOpen(false)
    } catch (err: any) {
      setError(err.message || 'Could not save')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
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
          maxWidth: '440px',
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
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>

        <h2
          id="contact-confirm-title"
          style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}
        >
          {mode === 'confirm' ? 'Is this still your mobile number?' : 'Please add your mobile number'}
        </h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px', lineHeight: 1.5 }}>
          {mode === 'confirm'
            ? 'We use this to reach you about urgent matters. Quickly let us know if it’s still correct.'
            : 'We need a mobile number on file so we can reach you about urgent matters.'}
        </p>

        {mode === 'confirm' && existingPhone && (
          <>
            <div
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                padding: '14px 16px',
                fontSize: '17px',
                fontWeight: 600,
                color: '#0f172a',
                letterSpacing: '0.5px',
                marginBottom: '18px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {existingPhone}
            </div>

            {error && (
              <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleConfirmExisting}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  backgroundColor: brandColor,
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Saving…' : 'Yes, still mine'}
              </button>
              <button
                onClick={() => { setMode('edit'); setError(null) }}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  backgroundColor: 'white',
                  color: brandColor,
                  fontSize: '14px',
                  fontWeight: 700,
                  border: `1.5px solid ${brandColor}`,
                  cursor: 'pointer',
                }}
              >
                No, update it
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <>
            <label
              htmlFor="contact-phone-input"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#64748b',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Mobile number
            </label>
            <input
              id="contact-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phoneInput}
              onChange={e => { setPhoneInput(e.target.value); setError(null) }}
              placeholder="+971 50 123 4567"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1.5px solid #E2E8F0',
                fontSize: '16px',
                color: '#0f172a',
                marginBottom: '14px',
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleSubmitNew}
                disabled={submitting || phoneInput.trim().length === 0}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  backgroundColor: brandColor,
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: submitting || !phoneInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: submitting || !phoneInput.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? 'Saving…' : 'Save mobile number'}
              </button>
              {existingPhone && (
                <button
                  onClick={() => { setMode('confirm'); setError(null); setPhoneInput(existingPhone) }}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: '14px',
                    backgroundColor: 'transparent',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
