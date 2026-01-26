import React, { useState } from 'react'
import { config } from '../config'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export function LoginView() {
  const { login, isLoading } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config
  const [error, setError] = useState<string | null>(null)

  const handleDemoLogin = async (type: 'parent' | 'admin' | 'superadmin') => {
    setError(null)
    try {
      if (type === 'parent') {
        await login('sarah@example.com', 'PARENT')
      } else if (type === 'admin') {
        await login('admin@vhps.ae', 'ADMIN')
      } else {
        await login('superadmin@wasil.app', 'SUPER_ADMIN')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
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
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* OAuth Buttons */}
          <a
            href="/auth/google"
            className="w-full flex items-center justify-center space-x-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-gray-700 font-medium">Continue with Google</span>
          </a>

          <a
            href="/auth/microsoft"
            className="w-full flex items-center justify-center space-x-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
            <span className="text-gray-700 font-medium">Continue with Microsoft</span>
          </a>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Demo Access</span>
            </div>
          </div>

          {/* Demo Login Buttons */}
          <button
            onClick={() => handleDemoLogin('parent')}
            disabled={isLoading}
            className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isLoading ? 'Signing in...' : 'Demo: Parent Login'}
          </button>

          <button
            onClick={() => handleDemoLogin('admin')}
            disabled={isLoading}
            className="w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
            style={{
              backgroundColor: theme.colors.accentColor,
              color: theme.colors.brandColor,
            }}
          >
            {isLoading ? 'Signing in...' : 'Demo: Admin Login'}
          </button>

          <button
            onClick={() => handleDemoLogin('superadmin')}
            disabled={isLoading}
            className="w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 border-2"
            style={{
              borderColor: theme.colors.brandColor,
              color: theme.colors.brandColor,
            }}
          >
            {isLoading ? 'Signing in...' : 'Demo: Super Admin Login'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-8">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>

        {/* Powered by Wasil */}
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
