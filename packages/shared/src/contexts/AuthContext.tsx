import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth, setTokens, clearTokens, getRefreshToken } from '../services/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, role?: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  handleOAuthCallback: (accessToken: string, refreshToken: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const logout = async () => {
    try {
      await auth.logout()
    } catch {
      // ignore
    }
    clearTokens()
    setUser(null)
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
        login,
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
