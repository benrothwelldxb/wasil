import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiFetch, clearTokens, getAccessToken, getRefreshToken, setTokens } from './api'

export interface ProviderInfo {
  id: string
  name: string
  type: 'ECA' | 'CATERING'
  status: 'ACTIVE' | 'SUSPENDED'
  logoUrl: string | null
}
export interface ProviderUser {
  id: string
  email: string
  name: string
  providerId: string
  provider?: ProviderInfo
}

interface AuthResponse {
  providerUser: ProviderUser
  accessToken: string
  refreshToken: string
}

interface LoginResult {
  twoFactorRequired: boolean
  sessionToken?: string
}

interface AuthState {
  providerUser: ProviderUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  verifyTwoFactor: (sessionToken: string, code: string, recovery?: boolean) => Promise<void>
  register: (token: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function ProviderAuthProvider({ children }: { children: ReactNode }) {
  const [providerUser, setProviderUser] = useState<ProviderUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      setProviderUser(null)
      return
    }
    try {
      const data = await apiFetch<{ providerUser: ProviderUser }>('/provider/auth/me')
      setProviderUser(data.providerUser)
    } catch {
      setProviderUser(null)
    }
  }, [])

  useEffect(() => {
    refreshMe().finally(() => setLoading(false))
  }, [refreshMe])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const data = await apiFetch<AuthResponse | { twoFactorRequired: true; twoFactorSessionToken: string }>('/provider/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if ('twoFactorRequired' in data && data.twoFactorRequired) {
      return { twoFactorRequired: true, sessionToken: data.twoFactorSessionToken }
    }
    const auth = data as AuthResponse
    setTokens(auth.accessToken, auth.refreshToken)
    setProviderUser(auth.providerUser)
    return { twoFactorRequired: false }
  }, [])

  const verifyTwoFactor = useCallback(async (sessionToken: string, code: string, recovery = false) => {
    const endpoint = recovery ? '/provider/auth/2fa/recover' : '/provider/auth/2fa/verify'
    const data = await apiFetch<AuthResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ sessionToken, code }),
    })
    setTokens(data.accessToken, data.refreshToken)
    setProviderUser(data.providerUser)
  }, [])

  const register = useCallback(async (token: string, password: string, name?: string) => {
    const data = await apiFetch<AuthResponse>('/provider/auth/register', {
      method: 'POST',
      body: JSON.stringify({ token, password, name }),
    })
    setTokens(data.accessToken, data.refreshToken)
    setProviderUser(data.providerUser)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    try {
      if (refreshToken) {
        await apiFetch('/provider/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
      }
    } catch {
      /* best-effort */
    }
    clearTokens()
    setProviderUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ providerUser, loading, login, verifyTwoFactor, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useProviderAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useProviderAuth must be used within ProviderAuthProvider')
  return ctx
}
