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

      // Set tokens and reload
      setTokens(data.accessToken, data.refreshToken)
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
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

        <form onSubmit={handleLogin} className="space-y-4">
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
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder="Enter your password"
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
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
