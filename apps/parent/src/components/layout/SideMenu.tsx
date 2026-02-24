import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  Globe,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'

interface SideMenuProps {
  open: boolean
  onClose: () => void
}

interface SupportedLanguage {
  code: string
  name: string
}

export function SideMenu({ open, onClose }: SideMenuProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout, refreshUser } = useAuth()
  const theme = useTheme()
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false)

  useEffect(() => {
    if (open && languages.length === 0) {
      api.users.languages().then(setLanguages).catch(console.error)
    }
  }, [open, languages.length])

  if (!open || !user) return null

  const currentLanguage = languages.find(l => l.code === user.preferredLanguage) || { code: 'en', name: 'English' }

  const handleLanguageChange = async (languageCode: string) => {
    if (languageCode === user.preferredLanguage) {
      setShowLanguageDropdown(false)
      return
    }
    setIsUpdatingLanguage(true)
    try {
      await api.users.updateLanguage(languageCode)
      // Reload the page to fetch all content in the new language
      window.location.reload()
    } catch (error) {
      console.error('Failed to update language:', error)
      setIsUpdatingLanguage(false)
    }
  }

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
    { icon: Home, labelKey: 'nav.home', path: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? '/admin' : '/' },
    { icon: Bell, labelKey: 'nav.eventsCalendar', path: '/events' },
    { icon: Calendar, labelKey: 'nav.termDates', path: '/term-dates' },
    { icon: User, labelKey: 'nav.principalUpdates', path: '/principal-updates' },
    { icon: BookOpen, labelKey: 'nav.schoolInfo', path: '/knowledge-base' },
    { icon: ScrollText, labelKey: 'nav.policies', path: '/policies' },
    { icon: Folder, labelKey: 'nav.files', path: '/files' },
  ]

  // Add Super Admin link for SUPER_ADMIN users
  if (user.role === 'SUPER_ADMIN') {
    menuItems.push({ icon: Shield, labelKey: 'nav.superAdmin', path: '/super-admin' })
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
              {t('nav.menu')}
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
                <span className="text-gray-700">{t(item.labelKey)}</span>
              </button>
            ))}

            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600"
            >
              <LogOut className="h-5 w-5" />
              <span>{t('nav.logout')}</span>
            </button>
          </div>

          {((user.children && user.children.length > 0) || (user.studentLinks && user.studentLinks.length > 0)) && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm font-semibold mb-2" style={{ color: theme.colors.brandColor }}>
                {t('settings.myChildren')}:
              </p>
              {user.children?.map((child) => (
                <div key={child.id} className="text-sm text-gray-600 mb-1">
                  {child.name} - {child.className}
                </div>
              ))}
              {user.studentLinks?.map((link) => (
                <div key={link.studentId} className="text-sm text-gray-600 mb-1">
                  {link.studentName} - {link.className}
                </div>
              ))}
            </div>
          )}

          {/* Language Selector */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm font-semibold mb-2" style={{ color: theme.colors.brandColor }}>
              {t('settings.language')}
            </p>
            <div className="relative">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg hover:bg-gray-100"
                disabled={isUpdatingLanguage}
              >
                <div className="flex items-center space-x-2">
                  <Globe className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">{currentLanguage.name}</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showLanguageDropdown && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto z-10">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                        lang.code === user.preferredLanguage ? 'bg-gray-100 font-medium' : ''
                      }`}
                      style={lang.code === user.preferredLanguage ? { color: theme.colors.brandColor } : undefined}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {t('auth.loggedInAs')} <span className="font-medium">{user.name}</span>
            </p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
