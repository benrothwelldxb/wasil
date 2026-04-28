import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth, TwoFactorRequiredError, setTokens, clearTokens, getRefreshToken, initTokenStorage } from '../services/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  twoFactorPending: boolean
  twoFactorSessionToken: string | null
  login: (email: string, role?: string) => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<void>
  verify2fa: (code: string) => Promise<void>
  recover2fa: (code: string) => Promise<{ recoveryCodesRemaining?: number }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  handleOAuthCallback: (accessToken: string, refreshToken: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [twoFactorSessionToken, setTwoFactorSessionToken] = useState<string | null>(null)

  const refreshUser = useCallback(async () => {
    try {
      const userData = await auth.me()
      setUser(userData)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Ensure tokens are loaded from secure storage (Capacitor Preferences)
        await initTokenStorage()
        // If we have a refresh token, try to get an access token first
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          const refreshed = await auth.refreshToken()
          if (refreshed) {
            const userData = await auth.me()
            setUser(userData)
            return
          }
        }
        setUser(null)
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, role?: string) => {
    setIsLoading(true)
    try {
      const userData = await auth.demoLogin(email, role)
      setUser(userData)
    } finally {
      setIsLoading(false)
    }
  }

  const loginWithPassword = async (email: string, password: string) => {
    // Don't set isLoading here — it would unmount the login form and hide errors.
    // Only set isLoading during the initial auth check on app load.
    try {
      const userData = await auth.login(email, password)
      setTwoFactorPending(false)
      setTwoFactorSessionToken(null)
      setUser(userData)
    } catch (err) {
      if (err instanceof TwoFactorRequiredError) {
        setTwoFactorPending(true)
        setTwoFactorSessionToken(err.twoFactorSessionToken)
        return // Don't re-throw — the UI should show the 2FA form
      }
      // Re-throw so the calling component can display the error
      throw err
    }
  }

  const verify2fa = async (code: string) => {
    if (!twoFactorSessionToken) throw new Error('No 2FA session')
    const userData = await auth.verify2fa(twoFactorSessionToken, code)
    setTwoFactorPending(false)
    setTwoFactorSessionToken(null)
    setUser(userData)
  }

  const recover2fa = async (code: string) => {
    if (!twoFactorSessionToken) throw new Error('No 2FA session')
    const { user: userData, recoveryCodesRemaining } = await auth.recover2fa(twoFactorSessionToken, code)
    setTwoFactorPending(false)
    setTwoFactorSessionToken(null)
    setUser(userData)
    return { recoveryCodesRemaining }
  }

  const logout = async () => {
    try {
      await auth.logout()
    } catch {
      // ignore
    }
    clearTokens()
    setUser(null)
    setTwoFactorPending(false)
    setTwoFactorSessionToken(null)
  }

  const handleOAuthCallback = async (accessToken: string, refreshToken: string) => {
    setTokens(accessToken, refreshToken)
    try {
      const userData = await auth.me()
      setUser(userData)
    } catch {
      clearTokens()
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        twoFactorPending,
        twoFactorSessionToken,
        login,
        loginWithPassword,
        verify2fa,
        recover2fa,
        logout,
        refreshUser,
        handleOAuthCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
