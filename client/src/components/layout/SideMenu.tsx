import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Home,
  Bell,
  Calendar,
  User,
  BookOpen,
  FileText,
  Folder,
  ScrollText,
  LogOut,
  Shield,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

interface SideMenuProps {
  open: boolean
  onClose: () => void
}

export function SideMenu({ open, onClose }: SideMenuProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const theme = useTheme()

  if (!open || !user) return null

  const handleNavigation = (path: string) => {
    navigate(path)
    onClose()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    onClose()
  }

  const menuItems = [
    { icon: Home, label: 'Home', path: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? '/admin' : '/' },
    { icon: Bell, label: 'Events Calendar', path: '/events' },
    { icon: Calendar, label: 'Term Dates', path: '/term-dates' },
    { icon: User, label: "Principal's Updates", path: '/principal-updates' },
    { icon: BookOpen, label: 'School Information', path: '/knowledge-base' },
    { icon: ScrollText, label: 'Policies', path: '/policies' },
    { icon: Folder, label: 'Files', path: '/files' },
  ]

  // Add Super Admin link for SUPER_ADMIN users
  if (user.role === 'SUPER_ADMIN') {
    menuItems.push({ icon: Shield, label: 'Super Admin', path: '/super-admin' })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose}>
      <div
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
              Menu
            </h2>
            <button onClick={onClose}>
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          <div className="space-y-2">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100"
              >
                <item.icon className="h-5 w-5 text-gray-600" />
                <span className="text-gray-700">{item.label}</span>
              </button>
            ))}

            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>

          {user.children && user.children.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm font-semibold mb-2" style={{ color: theme.colors.brandColor }}>
                My Children:
              </p>
              {user.children.map((child) => (
                <div key={child.id} className="text-sm text-gray-600 mb-1">
                  {child.name} - {child.className}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Logged in as <span className="font-medium">{user.name}</span>
            </p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
