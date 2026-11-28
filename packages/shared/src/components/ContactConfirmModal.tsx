import React, { useEffect, useState } from 'react'
import { users } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface ContactConfirmModalProps {
  /** Brand colour for the confirm button. Defaults to warm rose. */
  brandColor?: string
}

/**
 * "Are your contact details up to date?" — the parent's mobile and email.
 *
 * Asked once a term, and every two weeks for a parent with no UAE number: the
 * office cannot ring a number outside the UAE, and the prompt says so plainly.
 * The server decides when (GET /api/users/me/contact-prompt); a school sets
 * School.contactConfirmDays to 0 to turn it off.
 *
 * Not dismissable — the parent confirms or corrects. A new number is used by
 * Connect at once; a new email is only REQUESTED, because it is their sign-in,
 * and the school changes it. Either way the school gets the change to put into
 * its own records.
 *
 * Mount once at the parent app root.
 */
export function ContactConfirmModal({
  brandColor = '#C4506E',
}: ContactConfirmModalProps) {
  const { user, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState<string | null>(null)
  const [reachable, setReachable] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [editingPhone, setEditingPhone] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Shown after an email change was asked for, so they know what happens next. */
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null)

  // Only parents see this. Staff and admins are excluded server-side too.
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'PARENT') return
    let cancelled = false
    users.contactPrompt()
      .then(prompt => {
        if (cancelled || !prompt.needsConfirmation) return
        setPhone(prompt.phone)
        setPhoneInput(prompt.phone ?? '')
        setReachable(prompt.phoneReachable ?? true)
        setEmail(prompt.email ?? null)
        setPendingEmail(prompt.pendingEmail ?? null)
        setEmailInput(prompt.pendingEmail ?? prompt.email ?? '')
        // No phone yet → straight to entering one.
        setEditingPhone(!prompt.phone)
        setOpen(true)
      })
      .catch(() => { /* network blip — don't block the app */ })
    return () => { cancelled = true }
  }, [isAuthenticated, user])

  const handleSave = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const nextPhone = editingPhone ? phoneInput.trim() : (phone ?? '')
      // The address they say is right. Not editing → whatever they already
      // asked for, or their current one; resending the current one while a
      // change is pending would withdraw it.
      const nextEmail = editingEmail ? emailInput.trim() : (pendingEmail ?? email ?? undefined)
      const result = await users.confirmContact(nextPhone, nextEmail || undefined)
      const asked = result.pendingEmail ?? null
      if (editingEmail && asked && asked !== pendingEmail) {
        setRequestedEmail(asked)
      } else {
        setOpen(false)
      }
    } catch (err: any) {
      setError(err.message || 'Could not save')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const editing = editingPhone || editingEmail
  const saveDisabled = submitting || (editingPhone && !phoneInput.trim()) || (editingEmail && !emailInput.trim())

  const label: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
  }
  const valueBox: React.CSSProperties = {
    backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '12px 14px', fontSize: '15px',
    fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', wordBreak: 'break-all',
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #E2E8F0',
    fontSize: '16px', color: '#0f172a', boxSizing: 'border-box',
  }
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: brandColor, fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', padding: 0, flexShrink: 0,
  }
  const note: React.CSSProperties = { fontSize: '12px', color: '#64748b', margin: '6px 0 0', lineHeight: 1.45 }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-confirm-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000, backgroundColor: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white', borderRadius: '22px', maxWidth: '440px', width: '100%',
          padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {requestedEmail ? (
          <>
            <h2 id="contact-confirm-title" style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              Thank you
            </h2>
            <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 18px', lineHeight: 1.5 }}>
              We’ve asked the school to change your email to <strong>{requestedEmail}</strong>. Until they do,
              keep signing in with <strong>{email}</strong>.
            </p>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '14px', backgroundColor: brandColor,
                color: 'white', fontSize: '14px', fontWeight: 700, border: 'none', cursor: 'pointer',
              }}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 id="contact-confirm-title" style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              {phone ? 'Are your contact details up to date?' : 'Please add your mobile number'}
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
              The school uses these to reach you, including in an emergency.
            </p>

            {phone && !reachable && !editingPhone && (
              <div
                style={{
                  backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px',
                  padding: '12px 14px', fontSize: '13px', color: '#92400E', lineHeight: 1.5, marginBottom: '16px',
                }}
              >
                <strong>The school can’t phone this number.</strong> It isn’t a UAE number. If you have a UAE
                mobile, please add it so we can reach you quickly. We’ll ask again in two weeks.
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <span style={label}>Mobile number</span>
              {editingPhone ? (
                <input
                  id="contact-phone-input"
                  aria-label="Mobile number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  value={phoneInput}
                  onChange={e => { setPhoneInput(e.target.value); setError(null) }}
                  placeholder="+971 50 123 4567"
                  style={input}
                />
              ) : (
                <div style={{ ...valueBox, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  <span>{phone}</span>
                  <button style={linkBtn} onClick={() => { setEditingPhone(true); setError(null) }}>Change</button>
                </div>
              )}
            </div>

            {email && (
              <div style={{ marginBottom: '16px' }}>
                <span style={label}>Email</span>
                {editingEmail ? (
                  <>
                    <input
                      aria-label="Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={emailInput}
                      onChange={e => { setEmailInput(e.target.value); setError(null) }}
                      style={input}
                    />
                    <p style={note}>
                      The school will update this for you. Until they do, keep signing in with {email}.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={valueBox}>
                      <span>{email}</span>
                      <button style={linkBtn} onClick={() => { setEditingEmail(true); setError(null) }}>Change</button>
                    </div>
                    {pendingEmail && (
                      <p style={note}>You asked us to change this to {pendingEmail}. The school is updating it.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

            <button
              onClick={handleSave}
              disabled={saveDisabled}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '14px', backgroundColor: brandColor,
                color: 'white', fontSize: '14px', fontWeight: 700, border: 'none',
                cursor: saveDisabled ? 'not-allowed' : 'pointer', opacity: saveDisabled ? 0.5 : 1,
              }}
            >
              {submitting
                ? 'Saving…'
                : editing
                  ? 'Save'
                  : reachable
                    ? 'Yes, these are correct'
                    : 'Keep this number for now'}
            </button>
            {editing && phone && (
              <button
                onClick={() => {
                  setEditingPhone(false)
                  setEditingEmail(false)
                  setPhoneInput(phone)
                  setEmailInput(pendingEmail ?? email ?? '')
                  setError(null)
                }}
                disabled={submitting}
                style={{
                  width: '100%', marginTop: '8px', padding: '10px 16px', borderRadius: '14px',
                  backgroundColor: 'transparent', color: '#64748b', fontSize: '13px', fontWeight: 600,
                  border: 'none', cursor: 'pointer',
                }}
              >
                Back
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
