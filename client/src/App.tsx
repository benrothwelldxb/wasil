import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Header, Footer, SideMenu, LoadingScreen, LoginView } from './components'
import { ParentDashboard } from './pages/ParentDashboard'
import { AdminDashboard } from './pages/AdminDashboard'
import { TermDatesPage } from './pages/TermDatesPage'
import { EventsPage } from './pages/EventsPage'
import { PrincipalUpdatesPage } from './pages/PrincipalUpdatesPage'
import { PoliciesPage } from './pages/PoliciesPage'
import { FilesPage } from './pages/FilesPage'
import { SuperAdminDashboard } from './pages/SuperAdminDashboard'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />
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

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <Routes>
      <Route
        path="/auth/callback"
        element={<AuthCallback />}
      />
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? '/admin' : '/'} replace />
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
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ParentDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AppLayout>
              <AdminDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <AppLayout>
              <EventsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/term-dates"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TermDatesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/principal-updates"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PrincipalUpdatesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/knowledge-base"
        element={
          <ProtectedRoute>
            <AppLayout>
              <KnowledgeBasePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/policies"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PoliciesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/files"
        element={
          <ProtectedRoute>
            <AppLayout>
              <FilesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/super-admin"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SuperAdminDashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Simple placeholder pages
function KnowledgeBasePage() {
  const { data: categories } = useApiData(() => import('./services/api').then(m => m.knowledge.list()), [])
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = React.useState<any>(null)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-burgundy">School Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories && categories.map((cat: any) => (
          <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
              className="w-full p-4 text-left flex items-center space-x-3 hover:bg-gray-50"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="font-medium">{cat.name}</span>
            </button>
            {expandedCategory === cat.id && (
              <div className="border-t border-gray-100 p-4 space-y-2">
                {cat.articles.map((article: any) => (
                  <button
                    key={article.id}
                    onClick={() => setSelectedArticle(article)}
                    className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm"
                  >
                    {article.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedArticle.title}</h3>
                <button onClick={() => setSelectedArticle(null)} className="text-gray-400 hover:text-gray-600">
                  <span className="sr-only">Close</span>
                  &times;
                </button>
              </div>
              <div className="prose prose-sm">
                {selectedArticle.content.split('\n').map((p: string, i: number) => (
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

// Simple hook for lazy-loaded API calls in placeholder pages
function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = React.useState<T | null>(null)
  React.useEffect(() => {
    fetcher().then(setData).catch(console.error)
  }, deps)
  return { data }
}
