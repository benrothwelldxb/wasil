import { Navigate, Route, Routes } from 'react-router-dom'
import { useProviderAuth } from './auth'
import { ProviderLayout } from './components/ProviderLayout'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { BookingsPage } from './pages/BookingsPage'
import { MenusPage } from './pages/MenusPage'
import { ProfilePage } from './pages/ProfilePage'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-4 border-warm-border border-t-brand animate-spin" />
    </div>
  )
}

export default function App() {
  const { providerUser, loading } = useProviderAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/login" element={providerUser ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={providerUser ? <Navigate to="/" replace /> : <RegisterPage />} />

      {providerUser ? (
        <Route element={<ProviderLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/menus" element={<MenusPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  )
}
