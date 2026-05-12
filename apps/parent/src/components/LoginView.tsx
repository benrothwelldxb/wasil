import React, { useState } from 'react'
import { config, useTheme, setTokens } from '@wasil/shared'
import { Eye, EyeOff } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function LoginView() {
  const theme = useTheme()
  const { defaultSchool } = config
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Forgot password / magic link state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    if (!forgotEmail) {
      setForgotError('Please enter your email address')
      return
    }
    setForgotLoading(true)
    try {
      const response = await fetch(`${API_URL}/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.toLowerCase() }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send reset link')
      }
      setForgotSuccess(true)
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      setTokens(data.accessToken, data.refreshToken)
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google?source=parent`
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
          <p className="text-gray-500 text-sm mt-1">Sign in to access the parent portal</p>
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

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="your.email@example.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              autoFocus
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
        </form>

        {/* Google OAuth — hidden until OAuth consent screen is approved
        <div className="mt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400">or</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-3 w-full flex items-center justify-center gap-2.5 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
        */}

        {/* Forgot Password */}
        <div className="mt-3 text-center">
          {!showForgotPassword && !forgotSuccess && (
            <button
              type="button"
              onClick={() => { setShowForgotPassword(true); setForgotEmail(email) }}
              style={{ color: theme.colors.brandColor, fontSize: '13px', fontWeight: 600 }}
              className="hover:underline"
            >
              Forgot password?
            </button>
          )}

          {showForgotPassword && !forgotSuccess && (
            <form onSubmit={handleForgotPassword} className="mt-2 space-y-2 text-left">
              <p className="text-xs text-gray-500">Enter your email and we'll send a sign-in link.</p>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => { setForgotEmail(e.target.value); setForgotError(null) }}
                placeholder="your.email@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={forgotLoading}
              />
              {forgotError && <p className="text-red-500 text-xs">{forgotError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setForgotError(null) }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading || !forgotEmail}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {forgotLoading ? 'Sending...' : 'Send Link'}
                </button>
              </div>
            </form>
          )}

          {forgotSuccess && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-xs font-medium">Check your email for a sign-in link</p>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setForgotSuccess(false); setForgotEmail('') }}
                className="mt-1 text-xs hover:underline"
                style={{ color: theme.colors.brandColor, fontWeight: 600 }}
              >
                Back to sign in
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          New parent?{' '}
          <a href="/register" className="font-medium" style={{ color: theme.colors.brandColor }}>Register here</a>
        </p>

        <p className="text-center text-[10px] text-gray-400 mt-2">
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
