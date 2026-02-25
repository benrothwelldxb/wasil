import React, { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth, LoadingScreen, api, useApi } from '@wasil/shared'
import type { KnowledgeCategory, KnowledgeArticle } from '@wasil/shared'
import { useTranslation } from 'react-i18next'
import { loadLanguage } from './i18n'
import { initPushNotifications, setupPushListeners, isPushSupported } from './services/pushNotifications'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { SideMenu } from './components/layout/SideMenu'
import { LoginView } from './components/LoginView'
import { RegisterPage } from './pages/RegisterPage'
import { ParentDashboard } from './pages/ParentDashboard'
import { TermDatesPage } from './pages/TermDatesPage'
import { EventsPage } from './pages/EventsPage'
import { PrincipalUpdatesPage } from './pages/PrincipalUpdatesPage'
import { PoliciesPage } from './pages/PoliciesPage'
import { FilesPage } from './pages/FilesPage'
import { LinksPage } from './pages/LinksPage'
import { EcaPage } from './pages/EcaPage'

const ADMIN_APP_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:3001'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function AdminRedirect() {
  useEffect(() => {
    window.location.href = ADMIN_APP_URL
  }, [])
  return <LoadingScreen />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const redirectingRef = React.useRef(false)

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Redirect admin/staff to admin app (only once)
  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'STAFF') {
    if (!redirectingRef.current) {
      redirectingRef.current = true
      window.location.href = ADMIN_APP_URL
    }
    return <LoadingScreen />
  }

  return <>{children}</>
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(!menuOpen)} />
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        {children}
      </main>
      <Footer />
    </div>
  )
}

function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleOAuthCallback } = useAuth()

  useEffect(() => {
    const token = searchParams.get('token')
    const refresh = searchParams.get('refresh')
    if (token && refresh) {
      handleOAuthCallback(token, refresh).then(() => {
        navigate('/', { replace: true })
      })
    } else {
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate, handleOAuthCallback])

  return <LoadingScreen />
}

function MagicLinkCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleOAuthCallback } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    // Verify the magic link token
    fetch(`${API_URL}/auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Invalid magic link')
        }
        return res.json()
      })
      .then((data) => {
        // Use the existing handleOAuthCallback to store tokens
        handleOAuthCallback(data.accessToken, data.refreshToken).then(() => {
          navigate('/', { replace: true })
        })
      })
      .catch((err) => {
        setError(err.message)
      })
  }, [searchParams, navigate, handleOAuthCallback])

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Link Invalid</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block px-6 py-3 rounded-lg font-semibold text-white bg-burgundy"
          >
            Back to Login
          </a>
        </div>
      </div>
    )
  }

  return <LoadingScreen />
}

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth()
  const { i18n } = useTranslation()
  const pushInitialized = useRef(false)

  // Sync language preference with i18n
  useEffect(() => {
    const lang = user?.preferredLanguage || 'en'
    if (lang !== i18n.language) {
      loadLanguage(lang).then(() => {
        i18n.changeLanguage(lang)
      })
    }
  }, [user?.preferredLanguage, i18n])

  // Initialize push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user || pushInitialized.current) return
    if (!isPushSupported()) return

    pushInitialized.current = true

    initPushNotifications().then((token) => {
      if (token) {
        console.log('Push notifications initialized')
        setupPushListeners((notification) => {
          console.log('Received notification:', notification)
          // Handle notification - could show in-app toast or navigate
          if (notification.tapped && notification.data?.route) {
            window.location.href = notification.data.route as string
          }
        })
      }
    })
  }, [isAuthenticated, user])

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/magic" element={<MagicLinkCallback />} />
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'STAFF')
              ? <AdminRedirect />
              : <Navigate to="/" replace />
          ) : (
            <div className="min-h-screen bg-cream">
              <Header menuOpen={false} onMenuToggle={() => {}} />
              <main className="max-w-7xl mx-auto px-4 py-8">
                <LoginView />
              </main>
            </div>
          )
        }
      />
      <Route
        path="/register"
        element={
          <div className="min-h-screen bg-cream">
            <Header menuOpen={false} onMenuToggle={() => {}} />
            <main className="max-w-7xl mx-auto px-4 py-8">
              <RegisterPage />
            </main>
          </div>
        }
      />
      <Route
        path="/"
        element={<ProtectedRoute><AppLayout><ParentDashboard /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/events"
        element={<ProtectedRoute><AppLayout><EventsPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/term-dates"
        element={<ProtectedRoute><AppLayout><TermDatesPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/principal-updates"
        element={<ProtectedRoute><AppLayout><PrincipalUpdatesPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/knowledge-base"
        element={<ProtectedRoute><AppLayout><KnowledgeBasePage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/policies"
        element={<ProtectedRoute><AppLayout><PoliciesPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/files"
        element={<ProtectedRoute><AppLayout><FilesPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/links"
        element={<ProtectedRoute><AppLayout><LinksPage /></AppLayout></ProtectedRoute>}
      />
      <Route
        path="/activities"
        element={<ProtectedRoute><AppLayout><EcaPage /></AppLayout></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function KnowledgeBasePage() {
  const { data: categories } = useApi<KnowledgeCategory[]>(() => api.knowledge.list(), [])
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = React.useState<KnowledgeArticle | null>(null)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-burgundy">School Information</h2>

      {(!categories || categories.length === 0) ? (
        <div className="text-center py-12 text-gray-500">
          <p>No information available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                className="w-full p-4 text-left flex items-center space-x-3 hover:bg-gray-50"
              >
                <span className="text-2xl">{cat.icon}</span>
                <div className="flex-1">
                  <span className="font-medium">{cat.name}</span>
                  <p className="text-xs text-gray-400">{cat.articles.length} article{cat.articles.length !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-gray-400">{expandedCategory === cat.id ? '−' : '+'}</span>
              </button>
              {expandedCategory === cat.id && cat.articles.length > 0 && (
                <div className="border-t border-gray-100 p-4 space-y-2">
                  {cat.articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm text-gray-700"
                    >
                      {article.title}
                    </button>
                  ))}
                </div>
              )}
              {expandedCategory === cat.id && cat.articles.length === 0 && (
                <div className="border-t border-gray-100 p-4 text-sm text-gray-400 text-center">
                  No articles in this category yet.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedArticle.title}</h3>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
              <div className="prose prose-sm text-gray-600">
                {selectedArticle.content.split('\n').map((p, i) => (
                  <p key={i} className="mb-2">{p}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
