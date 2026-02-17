import React, { useState } from 'react'
import { config, useAuth, useTheme } from '@wasil/shared'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function LoginView() {
  const { login, isLoading } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('Please enter your email address')
      return
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsSending(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send magic link')
      }

      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link')
    } finally {
      setIsSending(false)
    }
  }

  const handleDemoLogin = async () => {
    setError(null)
    try {
      await login('sarah@example.com', 'PARENT')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  // Show success message after email is sent
  if (emailSent) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-600 mb-6">
            We've sent a magic link to<br />
            <span className="font-medium text-gray-900">{email}</span>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Click the link in the email to sign in. The link will expire in 15 minutes.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleMagicLink}
              disabled={isSending}
              className="text-sm font-medium hover:underline"
              style={{ color: theme.colors.brandColor }}
            >
              {isSending ? 'Sending...' : 'Resend email'}
            </button>
            <div className="text-sm text-gray-400">or</div>
            <button
              onClick={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different email
            </button>
          </div>

          <div
            className="mt-8 -mx-8 -mb-8 px-8 py-4 rounded-b-2xl flex items-center justify-center space-x-2"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <span className="text-white text-sm opacity-80">Powered by</span>
            <img
              src={defaultSchool.wasilLogoWhite}
              alt="Wasil"
              className="h-5 w-auto"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <img
            src={theme.logoUrl}
            alt={theme.schoolName}
            className="h-32 w-auto mx-auto mb-4"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = '/school-logo.png'
            }}
          />
          <h2 className="text-2xl font-bold" style={{ color: theme.colors.brandColor }}>
            Welcome
          </h2>
          <p className="text-gray-600 mt-2">Sign in to access the parent portal</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleMagicLink} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="your.email@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
              disabled={isSending}
            />
          </div>

          <button
            type="submit"
            disabled={isSending || !email}
            className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isSending ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        {process.env.NODE_ENV !== 'production' && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Demo Access</span>
              </div>
            </div>

            <button
              onClick={() => handleDemoLogin()}
              disabled={isLoading}
              className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isLoading ? 'Signing in...' : 'Demo: Parent Login'}
            </button>
          </>
        )}

        <div className="my-6">
          <a
            href={import.meta.env.VITE_ADMIN_URL || 'http://localhost:3001'}
            className="w-full py-3 rounded-lg font-semibold transition-colors border-2 text-center block"
            style={{
              borderColor: theme.colors.brandColor,
              color: theme.colors.brandColor,
            }}
          >
            Staff / Admin Login →
          </a>
        </div>

        <p className="text-center text-sm text-gray-600">
          New parent?{' '}
          <a href="/register" className="font-medium" style={{ color: theme.colors.brandColor }}>
            Register here
          </a>
        </p>

        <p className="text-center text-xs text-gray-500 mt-4">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>

        <div
          className="mt-8 -mx-8 -mb-8 px-8 py-4 rounded-b-2xl flex items-center justify-center space-x-2"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <span className="text-white text-sm opacity-80">Powered by</span>
          <img
            src={defaultSchool.wasilLogoWhite}
            alt="Wasil"
            className="h-5 w-auto"
          />
        </div>
      </div>
    </div>
  )
}
