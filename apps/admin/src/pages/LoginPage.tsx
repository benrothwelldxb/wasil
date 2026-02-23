import React, { useState } from 'react'
import { config, useAuth, useTheme } from '@wasil/shared'
import { Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
  const { loginWithPassword, isLoading } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
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
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
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
                tabIndex={-1}
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
