import React, { useEffect, useRef, useState } from 'react'
import { config, useAuth, useTheme } from '@wasil/shared'

const RESEND_COOLDOWN_SECONDS = 30

// Server error slugs from /auth/code/verify (see PARENT-AUTH.md). Rate-limit
// errors from /auth/code/request arrive as ready-to-show sentences instead —
// only the verify-step slugs need translating here.
function describeVerifyError(err: unknown): string {
  const message = err instanceof Error ? err.message : ''
  if (message === 'invalid_code') return "That code isn't right — try again."
  if (message === 'invalid_or_expired_code') return 'That code has expired — request a new one.'
  if (message === 'too_many_attempts') return 'Too many attempts — request a new code.'
  if (message.toLowerCase().includes('too many')) return 'Too many attempts — request a new code.'
  return message || 'Something went wrong. Please try again.'
}

function describeRequestError(err: unknown): string {
  // The server's rate-limit messages are already parent-friendly sentences.
  const message = err instanceof Error ? err.message : ''
  return message || 'Something went wrong. Please try again.'
}

export function LoginView() {
  const theme = useTheme()
  const { defaultSchool } = config
  const {
    requestLoginCode,
    verifyLoginCode,
    verify2fa,
    twoFactorPending,
  } = useAuth()

  // Passwordless flow: step 1 (email) -> step 2 (6-digit code)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const verifyingRef = useRef(false)

  // 2FA (rare — most parents never see this)
  const [totpCode, setTotpCode] = useState('')
  const [isVerifying2fa, setIsVerifying2fa] = useState(false)
  const totpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'code' && codeInputRef.current) {
      codeInputRef.current.focus()
    }
  }, [step])

  useEffect(() => {
    if (twoFactorPending && totpInputRef.current) {
      totpInputRef.current.focus()
    }
  }, [twoFactorPending])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Auto-verify once all 6 digits are in, same as autofill from the OS's
  // one-time-code suggestion or a pasted code.
  useEffect(() => {
    if (code.length === 6 && step === 'code' && !isLoading && !verifyingRef.current) {
      handleVerifyCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    if (totpCode.length === 6 && twoFactorPending && !isVerifying2fa) {
      handleVerify2fa()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }

    setIsLoading(true)
    try {
      await requestLoginCode(email.trim().toLowerCase())
      setStep('code')
      setCode('')
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(describeRequestError(err))
    } finally {
      setIsLoading(false)
    }
  }

  // "I already have a code" — for parents given an admin-issued code by phone/in
  // person (their email can't receive the emailed code). Jump straight to the
  // code step WITHOUT calling requestLoginCode: sending a fresh email code would
  // supersede the admin-issued one and invalidate it.
  const handleUseExistingCode = () => {
    setError(null)
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    setCode('')
    setStep('code')
  }

  const handleVerifyCode = async () => {
    if (verifyingRef.current) return
    setError(null)
    verifyingRef.current = true
    setIsLoading(true)
    try {
      await verifyLoginCode(email.trim().toLowerCase(), code)
      // Success (and the 2FA hand-off) is picked up reactively — the auth
      // guard in App.tsx re-renders once the session/2FA state changes.
    } catch (err) {
      setError(describeVerifyError(err))
      setCode('')
    } finally {
      setIsLoading(false)
      verifyingRef.current = false
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || isLoading) return
    setError(null)
    setIsLoading(true)
    try {
      await requestLoginCode(email.trim().toLowerCase())
      setCode('')
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(describeRequestError(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleUseDifferentEmail = () => {
    setStep('email')
    setCode('')
    setError(null)
    setResendCooldown(0)
  }

  const handleVerify2fa = async () => {
    if (isVerifying2fa) return
    setError(null)
    setIsVerifying2fa(true)
    try {
      await verify2fa(totpCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setTotpCode('')
    } finally {
      setIsVerifying2fa(false)
    }
  }

  // --- Shared presentation. The sign-in always renders in the app's warm light
  // look; the school's brand colour drives the accents so it re-skins per tenant. ---
  const brand = theme.colors.brandColor
  const pageStyle: React.CSSProperties = {
    background: 'radial-gradient(130% 100% at 50% -8%, #FFFFFF 0%, #F6EEE8 58%, #EFE4DC 100%)',
  }
  const cardStyle: React.CSSProperties = {
    borderRadius: '24px',
    boxShadow: '0 22px 50px -26px rgba(60,25,35,.34), 0 2px 8px rgba(0,0,0,.04)',
  }
  const fieldStyle = {
    borderColor: '#E7DCD4',
    borderWidth: '1.5px',
    ['--tw-ring-color']: brand,
  } as React.CSSProperties

  // --- 2FA step (after a passwordless code is verified, if the account has 2FA) ---
  if (twoFactorPending) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10" style={pageStyle}>
        <div className="bg-white p-6 pt-7 max-w-sm w-full" style={cardStyle}>
          <div className="text-center mb-5">
            <img
              src={theme.logoUrl}
              alt={theme.schoolName}
              className="h-16 w-auto mx-auto mb-3"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/school-logo.png'
              }}
            />
            <h2 className="text-[22px] font-extrabold tracking-tight" style={{ color: brand }}>
              Two-step verification
            </h2>
            <p className="text-[13px] leading-relaxed mt-2" style={{ color: '#a2979a' }}>
              Enter the 6-digit code from your authenticator app.
            </p>
          </div>

          {error && (
            <div
              className="mb-3 p-3 text-sm font-medium"
              style={{ borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1.5px solid rgba(209,77,77,0.2)', color: '#D14D4D' }}
            >
              {error}
            </div>
          )}

          <input
            ref={totpInputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-4 py-3 border rounded-xl text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:border-transparent outline-none"
            style={fieldStyle}
            placeholder="000000"
            disabled={isVerifying2fa}
          />
          {isVerifying2fa && <p className="text-center text-sm mt-3" style={{ color: '#8a7f82' }}>Verifying…</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10" style={pageStyle}>
      <div className="bg-white p-6 pt-7 max-w-sm w-full" style={cardStyle}>
        <div className="text-center mb-5">
          <img
            src={theme.logoUrl}
            alt={theme.schoolName}
            className="h-16 w-auto mx-auto mb-3"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = '/school-logo.png'
            }}
          />
          <h2 className="text-[22px] font-extrabold tracking-tight" style={{ color: brand }}>
            Welcome
          </h2>
          <p className="text-[12.5px] font-semibold mt-1" style={{ color: '#8a7f82' }}>
            {theme.schoolName}{theme.city ? ` · ${theme.city}` : ''}
          </p>
          {step === 'email' && (
            <p className="text-[13px] leading-relaxed mt-2.5" style={{ color: '#a2979a' }}>
              Please use the email you gave the school when you registered your child, and we'll send you a 6-digit sign-in code.
            </p>
          )}
          {step === 'code' && (
            <p className="text-[13px] leading-relaxed mt-2.5" style={{ color: '#a2979a' }}>
              We've sent a 6-digit code to <span className="font-semibold" style={{ color: '#5f5457' }}>{email}</span>. Enter it below.
            </p>
          )}
        </div>

        {error && (
          <div
            className="mb-3 p-3 text-sm font-medium"
            style={{
              borderRadius: '12px',
              backgroundColor: error.includes('Too many') || error.includes('locked') ? '#FFF7EC' : '#FEF2F2',
              border: error.includes('Too many') || error.includes('locked') ? '1.5px solid rgba(232,165,75,0.3)' : '1.5px solid rgba(209,77,77,0.2)',
              color: error.includes('Too many') || error.includes('locked') ? '#8B5E0F' : '#D14D4D',
            }}
          >
            {error}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleSendCode} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold mb-1.5" style={{ color: '#6f6467' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                placeholder="your.email@example.com"
                autoComplete="email"
                className="w-full px-3.5 h-11 border rounded-xl text-sm focus:ring-2 focus:border-transparent outline-none"
                style={fieldStyle}
                autoFocus
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full h-11 rounded-xl font-bold text-[14px] text-white transition-all active:scale-[.99] disabled:opacity-50"
              style={{ backgroundColor: brand, boxShadow: `0 12px 24px -14px ${brand}` }}
            >
              {isLoading ? 'Sending…' : 'Send code'}
            </button>

            <button
              type="button"
              onClick={handleUseExistingCode}
              disabled={isLoading || !email}
              className="w-full text-center text-[12px] font-semibold hover:opacity-80 disabled:opacity-40 pt-0.5"
              style={{ color: '#948a8d' }}
            >
              I already have a code
            </button>
          </form>
        )}

        {step === 'code' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold mb-1.5" style={{ color: '#6f6467' }}>6-digit code</label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
                placeholder="000000"
                className="w-full px-4 py-3 border rounded-xl text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:border-transparent outline-none"
                style={fieldStyle}
                disabled={isLoading}
              />
            </div>

            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={isLoading || code.length !== 6}
              className="w-full h-11 rounded-xl font-bold text-[14px] text-white transition-all active:scale-[.99] disabled:opacity-50"
              style={{ backgroundColor: brand, boxShadow: `0 12px 24px -14px ${brand}` }}
            >
              {isLoading ? 'Verifying…' : 'Verify'}
            </button>

            <div className="flex items-center justify-between text-[12px] pt-1">
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="font-semibold hover:opacity-80"
                style={{ color: '#948a8d' }}
                disabled={isLoading}
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isLoading}
                className="font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: brand }}
              >
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </div>

            <p className="text-center text-[11.5px] leading-relaxed pt-1" style={{ color: '#b0a5a8' }}>
              Can't find it? Check your spam folder — the code is sent from Wasil Connect. If nothing arrives, make sure you used the email you gave the school when you registered your child.
            </p>
            {defaultSchool.supportEmail && (
              <p className="text-center text-[11.5px]" style={{ color: '#b0a5a8' }}>
                Still not receiving it?{' '}
                <a href={`mailto:${defaultSchool.supportEmail}`} className="underline font-semibold" style={{ color: brand }}>
                  Email us for help
                </a>
                .
              </p>
            )}
          </div>
        )}

        {theme.tagline && (
          <div className="mt-5 pt-3.5 text-center" style={{ borderTop: '1px solid #F1EAE4' }}>
            <span className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.09em', color: brand }}>
              {theme.tagline}
            </span>
          </div>
        )}

        <p className="text-center text-[10px] mt-4" style={{ color: '#b8adb0' }}>
          By signing in, you agree to our <a href="/terms.html" target="_blank" className="underline">Terms of Service</a> and <a href="/privacy.html" target="_blank" className="underline">Privacy Policy</a>
        </p>

        {defaultSchool.showWasilBranding && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="text-[10px]" style={{ color: '#c0b5b8' }}>Powered by</span>
            <img src={defaultSchool.wasilLogoGrey} alt="Wasil" className="h-3 w-auto opacity-40" />
          </div>
        )}
      </div>
    </div>
  )
}
