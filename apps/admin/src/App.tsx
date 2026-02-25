import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth, LoadingScreen } from '@wasil/shared'
import { AdminLayout } from './components/layout/AdminLayout'
import { LoginPage } from './pages/LoginPage'
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

const PARENT_APP_URL = import.meta.env.VITE_PARENT_URL || 'http://localhost:3000'

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

  if (superAdminOnly && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/messages" replace />
  }

  return <>{children}</>
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
        navigate('/messages', { replace: true })
      })
    } else {
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate, handleOAuthCallback])

  return <LoadingScreen />
}

export default function App() {
  const { isLoading, isAuthenticated, user } = useAuth()

  if (isLoading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            user?.role === 'PARENT'
              ? <ParentRedirect />
              : <Navigate to="/messages" replace />
          ) : (
            <LoginPage />
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
        <Route index element={<Navigate to="/messages" replace />} />
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
      <Route path="*" element={<Navigate to="/messages" replace />} />
    </Routes>
  )
}
