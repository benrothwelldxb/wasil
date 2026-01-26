import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { auth } from '../services/api'
import type { User, Child } from '../types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, role?: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const userData = await auth.me()
      setUser(userData)
    } catch (error) {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await auth.me()
        setUser(userData)
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
      setUser(null)
    } catch (error) {
      console.error('Logout error:', error)
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
