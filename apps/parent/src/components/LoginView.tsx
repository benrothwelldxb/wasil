import React, { useEffect, useRef, useState } from 'react'
import { config, useAuth, useTheme } from '@wasil/shared'
import { Eye, EyeOff } from 'lucide-react'

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
    loginWithPassword,
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

  // Secondary password fallback
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)
    try {
      await loginWithPassword(email.trim().toLowerCase(), password)
      // Non-2FA success and the 2FA hand-off are both picked up reactively.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
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

  // --- 2FA step (after a passwordless code or password is verified) ---
  if (twoFactorPending) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
          <div className="text-center mb-5">
            <img
              src={theme.logoUrl}
              alt={theme.schoolName}
              className="h-20 w-auto mx-auto mb-3"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/school-logo.png'
              }}
            />
            <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
              Two-Factor Authentication
            </h2>
            <p className="text-gray-500 text-sm mt-1">Enter the 6-digit code from your authenticator app</p>
          </div>

          {error && (
            <div className="mb-3 p-3 text-sm font-medium rounded-xl bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              ref={totpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:ring-offset-0 focus:border-transparent"
              style={{ '--tw-ring-color': theme.colors.brandColor } as React.CSSProperties}
              placeholder="000000"
              disabled={isVerifying2fa}
            />
            {isVerifying2fa && <p className="text-center text-sm text-gray-500">Verifying...</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <div className="text-center mb-5">
          <img
            src={theme.logoUrl}
            alt={theme.schoolName}
            className="h-20 w-auto mx-auto mb-3"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = '/school-logo.png'
            }}
          />
          <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
            Welcome
          </h2>
          {!showPasswordForm && step === 'email' && (
            <p className="text-gray-500 text-sm mt-1">
              Enter your email and we'll send you a 6-digit sign-in code.
            </p>
          )}
          {!showPasswordForm && step === 'code' && (
            <p className="text-gray-500 text-sm mt-1">
              We've sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>.
              Enter it below.
            </p>
          )}
          {showPasswordForm && <p className="text-gray-500 text-sm mt-1">Sign in with your password</p>}
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

        {!showPasswordForm && step === 'email' && (
          <form onSubmit={handleSendCode} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                placeholder="your.email@example.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                autoFocus
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isLoading ? 'Sending...' : 'Send code'}
            </button>
          </form>
        )}

        {!showPasswordForm && step === 'code' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={isLoading || code.length !== 6}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="text-gray-500 hover:text-gray-700 font-medium"
                disabled={isLoading}
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isLoading}
                className="font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: theme.colors.brandColor }}
              >
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 pt-1">Can't find it? Check your spam folder.</p>
          </div>
        )}

        {showPasswordForm && (
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                placeholder="your.email@example.com"
                autoComplete="email"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setShowPasswordForm(false); setPassword(''); setError(null) }}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Use a sign-in code instead
            </button>
          </form>
        )}

        {!showPasswordForm && step === 'email' && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => { setShowPasswordForm(true); setError(null) }}
              className="text-gray-500 hover:text-gray-700 text-xs font-medium hover:underline"
            >
              Sign in with a password instead
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-gray-400 mt-4">
          By signing in, you agree to our <a href="/terms.html" target="_blank" className="underline">Terms of Service</a> and <a href="/privacy.html" target="_blank" className="underline">Privacy Policy</a>
        </p>

        {defaultSchool.showWasilBranding && (
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <span className="text-[10px] text-gray-400">Powered by</span>
            <img src={defaultSchool.wasilLogoGrey} alt="Wasil" className="h-3 w-auto opacity-40" />
          </div>
        )}
      </div>
    </div>
  )
}
