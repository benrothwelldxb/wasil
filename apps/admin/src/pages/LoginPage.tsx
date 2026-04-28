import React, { useState, useRef, useEffect } from 'react'
import { config, useAuth, useTheme } from '@wasil/shared'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function LoginPage() {
  const { loginWithPassword, verify2fa, recover2fa, twoFactorPending, isLoading } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 2FA state
  const [totpCode, setTotpCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [useRecovery, setUseRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const totpInputRef = useRef<HTMLInputElement>(null)

  // Focus TOTP input when 2FA step appears
  useEffect(() => {
    if (twoFactorPending && totpInputRef.current) {
      totpInputRef.current.focus()
    }
  }, [twoFactorPending])

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (totpCode.length === 6 && twoFactorPending && !useRecovery) {
      handleVerify2fa()
    }
  }, [totpCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    try {
      await loginWithPassword(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleVerify2fa = async () => {
    if (isVerifying) return
    setError(null)
    setIsVerifying(true)
    try {
      await verify2fa(totpCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setTotpCode('')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isVerifying || !recoveryCode.trim()) return
    setError(null)
    setIsVerifying(true)
    try {
      const { recoveryCodesRemaining } = await recover2fa(recoveryCode.trim())
      if (recoveryCodesRemaining !== undefined && recoveryCodesRemaining <= 2) {
        // User will be logged in — they'll see the warning on dashboard
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid recovery code')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google?source=admin`
  }

  // 2FA verification step
  if (twoFactorPending) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            {theme.logoIconUrl ? (
              <img src={theme.logoIconUrl} alt={theme.schoolName} className="h-12 w-auto mx-auto mb-3" />
            ) : (
              <div
                className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                W
              </div>
            )}
            <h2 className="text-xl font-bold text-slate-900">
              {useRecovery ? 'Recovery Code' : 'Two-Factor Authentication'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {useRecovery
                ? 'Enter one of your recovery codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {useRecovery ? (
            <form onSubmit={handleRecover} className="space-y-4">
              <input
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-lg tracking-wider focus:ring-2 focus:ring-offset-0 focus:border-transparent"
                style={{ '--tw-ring-color': theme.colors.brandColor } as React.CSSProperties}
                placeholder="XXXX-XXXX"
                disabled={isVerifying}
                autoFocus
              />
              <button
                type="submit"
                disabled={isVerifying || !recoveryCode.trim()}
                className="w-full py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isVerifying ? 'Verifying...' : 'Use Recovery Code'}
              </button>
              <button
                type="button"
                onClick={() => { setUseRecovery(false); setError(null); setRecoveryCode('') }}
                className="w-full flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to authenticator code
              </button>
            </form>
          ) : (
            <div className="space-y-4">
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
                disabled={isVerifying}
              />
              {totpCode.length === 6 && isVerifying && (
                <p className="text-center text-sm text-slate-500">Verifying...</p>
              )}
              <button
                type="button"
                onClick={() => { setUseRecovery(true); setError(null); setTotpCode('') }}
                className="w-full text-sm text-slate-500 hover:text-slate-700"
              >
                Use a recovery code instead
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          {theme.logoIconUrl ? (
            <img
              src={theme.logoIconUrl}
              alt={theme.schoolName}
              className="h-16 w-auto mx-auto mb-4"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center text-white font-bold text-xl"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              W
            </div>
          )}
          <h2 className="text-2xl font-bold text-slate-900">Admin Login</h2>
          <p className="text-sm text-slate-500 mt-1">{theme.schoolName}</p>
        </div>

        {error && (
          <div
            className="mb-4 p-4 rounded-xl text-sm font-medium"
            style={{
              backgroundColor: error.includes('Too many') || error.includes('locked') ? '#FFF7EC' : '#FEF2F2',
              border: error.includes('Too many') || error.includes('locked') ? '1.5px solid rgba(232,165,75,0.3)' : '1.5px solid rgba(209,77,77,0.2)',
              color: error.includes('Too many') || error.includes('locked') ? '#8B5E0F' : '#D14D4D',
            }}
          >
            {(error.includes('Too many') || error.includes('locked')) && (
              <p className="font-bold mb-1">Account temporarily locked</p>
            )}
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0 focus:border-transparent transition-colors"
              style={{
                '--tw-ring-color': theme.colors.brandColor
              } as React.CSSProperties}
              placeholder="admin@school.com"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-900 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0 focus:border-transparent transition-colors"
                style={{
                  '--tw-ring-color': theme.colors.brandColor
                } as React.CSSProperties}
                placeholder="Enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-lg font-medium text-white transition-colors disabled:opacity-50 mt-6"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Powered by Wasil */}
        {defaultSchool.showWasilBranding && (
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5">
            <span className="text-[11px] text-slate-400">Powered by</span>
            <img
              src={defaultSchool.wasilLogoGrey}
              alt="Wasil"
              className="h-3.5 w-auto opacity-50"
            />
          </div>
        )}
      </div>
    </div>
  )
}
