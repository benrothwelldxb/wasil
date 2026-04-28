import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth, LoadingScreen } from '@wasil/shared'
import { AdminLayout } from './components/layout/AdminLayout'
import { LoginPage } from './pages/LoginPage'
import { TwoFactorSetupPage } from './pages/TwoFactorSetupPage'
import { MessagesPage } from './pages/MessagesPage'
import { FormsPage } from './pages/FormsPage'
import { EventsPage } from './pages/EventsPage'
import { WeeklyMessagesPage } from './pages/WeeklyMessagesPage'
import { TermDatesPage } from './pages/TermDatesPage'
import { PulsePage } from './pages/PulsePage'
import { YearGroupsPage } from './pages/YearGroupsPage'
import { ClassesPage } from './pages/ClassesPage'
import { StudentsPage } from './pages/StudentsPage'
import { StaffPage } from './pages/StaffPage'
import { ParentsPage } from './pages/ParentsPage'
import { PoliciesPage } from './pages/PoliciesPage'
import { FilesPage } from './pages/FilesPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { SchoolsPage } from './pages/SchoolsPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { SchedulePage } from './pages/SchedulePage'
import { LinksPage } from './pages/LinksPage'
import { GroupsPage } from './pages/GroupsPage'
import { EcaPage } from './pages/EcaPage'
import { ConsultationsPage } from './pages/ConsultationsPage'
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage'
import { EmergencyAlertsPage } from './pages/EmergencyAlertsPage'
import { SchoolServicesPage } from './pages/SchoolServicesPage'
import { StaffInboxPage } from './pages/InboxPage'
import { AdminCafeteriaPage } from './pages/CafeteriaPage'

const PARENT_APP_URL = import.meta.env.VITE_PARENT_URL || 'http://localhost:3000'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function ParentRedirect() {
  useEffect(() => {
    window.location.href = PARENT_APP_URL
  }, [])
  return <LoadingScreen />
}

function ProtectedRoute({ children, superAdminOnly = false }: { children: React.ReactNode; superAdminOnly?: boolean }) {
  const { user, isLoading, isAuthenticated } = useAuth()

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Redirect parents to parent app
  if (user?.role === 'PARENT') {
    return <ParentRedirect />
  }

  // Force 2FA setup if required but not enabled
  if (user?.twoFactorRequired && !user?.twoFactorEnabled) {
    return <Navigate to="/setup-2fa" replace />
  }

  if (superAdminOnly && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/analytics" replace />
  }

  return <>{children}</>
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

    fetch(`${API_URL}/auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Invalid or expired link')
        }
        return res.json()
      })
      .then((data) => {
        if (data.twoFactorRequired && data.twoFactorSessionToken) {
          // Magic link with 2FA — redirect to login with session info
          // Store session token and redirect to login
          navigate('/login', { replace: true })
          return
        }
        handleOAuthCallback(data.accessToken, data.refreshToken).then(() => {
          navigate('/analytics', { replace: true })
        })
      })
      .catch((err) => {
        setError(err.message)
      })
  }, [searchParams, navigate, handleOAuthCallback])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Link Invalid or Expired</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <a href="/login" className="inline-block px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: '#C4506E' }}>
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  return <LoadingScreen />
}

function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleOAuthCallback } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const token = searchParams.get('token')
    const refresh = searchParams.get('refresh')

    if (code) {
      // OAuth flow: exchange code for tokens
      fetch(`${API_URL}/auth/exchange-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Authentication failed')
          }
          return res.json()
        })
        .then((data) => {
          handleOAuthCallback(data.accessToken, data.refreshToken).then(() => {
            navigate('/analytics', { replace: true })
          })
        })
        .catch((err) => {
          setError(err.message)
          setTimeout(() => navigate('/login', { replace: true }), 3000)
        })
    } else if (token && refresh) {
      // Legacy direct token flow
      handleOAuthCallback(token, refresh).then(() => {
        navigate('/analytics', { replace: true })
      })
    } else {
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate, handleOAuthCallback])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <p className="text-red-600 mb-2">{error}</p>
          <p className="text-slate-500 text-sm">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return <LoadingScreen />
}

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth()

  if (isLoading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/magic" element={<MagicLinkCallback />} />
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            user?.role === 'PARENT'
              ? <ParentRedirect />
              : <Navigate to="/analytics" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/setup-2fa"
        element={
          isAuthenticated ? (
            <TwoFactorSetupPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/analytics" replace />} />
        <Route path="/analytics" element={<AnalyticsDashboardPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/forms" element={<FormsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/weekly" element={<WeeklyMessagesPage />} />
        <Route path="/term-dates" element={<TermDatesPage />} />
        <Route path="/pulse" element={<PulsePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/year-groups" element={<YearGroupsPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/parents" element={<ParentsPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/links" element={<LinksPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/eca" element={<EcaPage />} />
        <Route path="/consultations" element={<ConsultationsPage />} />
        <Route path="/emergency-alerts" element={<EmergencyAlertsPage />} />
        <Route path="/school-services" element={<SchoolServicesPage />} />
        <Route path="/inbox" element={<StaffInboxPage />} />
        <Route path="/cafeteria" element={<AdminCafeteriaPage />} />
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route
          path="/schools"
          element={
            <ProtectedRoute superAdminOnly>
              <SchoolsPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/analytics" replace />} />
    </Routes>
  )
}
