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
  ExternalLink,
  UsersRound,
  Sparkles,
  CalendarCheck,
  Clock,
  Settings,
  Target,
  UtensilsCrossed,
} from 'lucide-react'
import { useAuth } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ParentGroupInfo } from '@wasil/shared'

interface SideMenuProps {
  open: boolean
  onClose: () => void
}

interface SupportedLanguage {
  code: string
  name: string
}

const childGradients = [
  'linear-gradient(135deg, #5B8EC4, #7BAAD4)',
  'linear-gradient(135deg, #5BA97B, #7BC49B)',
  'linear-gradient(135deg, #C4506E, #D4708A)',
  'linear-gradient(135deg, #E8A54B, #F0C07B)',
  'linear-gradient(135deg, #8B6EC4, #A88ED4)',
]

export function SideMenu({ open, onClose }: SideMenuProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout, refreshUser } = useAuth()
  const theme = useTheme()
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false)
  const [parentGroups, setParentGroups] = useState<ParentGroupInfo[]>([])
  const [hasActiveEca, setHasActiveEca] = useState(false)
  const [hasActiveConsultations, setHasActiveConsultations] = useState(false)

  useEffect(() => {
    if (open && languages.length === 0) {
      api.users.languages().then(setLanguages).catch(console.error)
    }
  }, [open, languages.length])

  // Check if there are active ECAs or consultations to show in menu
  useEffect(() => {
    if (open && user) {
      api.eca.parent.listTerms()
        .then(terms => {
          const active = terms?.some((t: any) =>
            ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE'].includes(t.status)
          )
          setHasActiveEca(!!active)
        })
        .catch(() => setHasActiveEca(false))

      api.consultations.parent.list()
        .then(consultations => {
          const active = consultations?.some((c: any) =>
            ['PUBLISHED', 'BOOKING_OPEN', 'BOOKING_CLOSED'].includes(c.status)
          )
          setHasActiveConsultations(!!active)
        })
        .catch(() => setHasActiveConsultations(false))
    }
  }, [open, user])

  useEffect(() => {
    if (open && user && parentGroups.length === 0) {
      api.groups.forParent().then(setParentGroups).catch(console.error)
    }
  }, [open, user, parentGroups.length])

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

  const menuItems: Array<{ icon: any; labelKey: string; path: string }> = [
    { icon: Home, labelKey: 'nav.home', path: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? '/admin' : '/' },
    { icon: Bell, labelKey: 'nav.eventsCalendar', path: '/events' },
    { icon: Calendar, labelKey: 'nav.termDates', path: '/term-dates' },
    { icon: User, labelKey: 'nav.principalUpdates', path: '/principal-updates' },
  ]

  if (hasActiveEca) {
    menuItems.push({ icon: Sparkles, labelKey: 'nav.activities', path: '/activities' })
  }

  menuItems.push({ icon: Clock, labelKey: 'nav.schoolServices', path: '/school-services' })

  if (hasActiveConsultations) {
    menuItems.push({ icon: CalendarCheck, labelKey: 'nav.consultations', path: '/consultations' })
  }

  menuItems.push({ icon: UtensilsCrossed, labelKey: 'nav.lunchMenu', path: '/lunch-menu' })
  menuItems.push({ icon: BookOpen, labelKey: 'nav.resources', path: '/resources' })
  menuItems.push({ icon: Target, labelKey: 'nav.inclusion', path: '/inclusion' })
  menuItems.push({ icon: Settings, labelKey: 'nav.notificationSettings', path: '/notifications/settings' })

  // Add Super Admin link for SUPER_ADMIN users
  if (user.role === 'SUPER_ADMIN') {
    menuItems.push({ icon: Shield, labelKey: 'nav.superAdmin', path: '/super-admin' })
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50" onClick={onClose} aria-hidden="true">
      <div
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl overflow-y-auto"
        role="dialog"
        aria-label="Navigation menu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Menu Header */}
        <div className="p-6" style={{ backgroundColor: '#FFF7F9' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#2D2225' }}>
              {t('nav.menu')}
            </h2>
            <button
              onClick={onClose}
              className="rounded-xl"
              aria-label="Close menu"
              style={{ minWidth: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X className="h-5 w-5" style={{ color: '#7A6469' }} />
            </button>
          </div>

          {/* User avatar and info */}
          <div className="flex items-center space-x-3">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: '44px',
                height: '44px',
                background: 'linear-gradient(135deg, #C4506E, #E8A54B)',
                color: 'white',
                fontWeight: 700,
                fontSize: '16px',
              }}
            >
              {getInitials(user.name || 'U')}
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#2D2225' }}>{user.name}</p>
              <p className="text-xs" style={{ color: '#A8929A' }}>{user.email}</p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-4">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl"
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  minHeight: '48px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFF8F4'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <item.icon className="h-5 w-5" style={{ color: '#7A6469' }} />
                <span style={{ color: '#2D2225' }}>{t(item.labelKey)}</span>
              </button>
            ))}

            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl"
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#D14D4D',
                minHeight: '48px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FFF0F0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <LogOut className="h-5 w-5" />
              <span>{t('nav.logout')}</span>
            </button>
          </div>

          {(() => {
            // Deduplicate: prefer studentLinks (newer), fall back to children
            const allChildren: Array<{ id: string; name: string; className: string; teacherName?: string }> = []
            const seen = new Set<string>()
            // studentLinks first (newer model)
            user.studentLinks?.forEach(link => {
              if (!seen.has(link.studentName.trim())) {
                seen.add(link.studentName.trim())
                allChildren.push({ id: link.studentId, name: link.studentName.trim(), className: link.className, teacherName: link.teacherName || undefined })
              }
            })
            // then legacy children, skipping duplicates
            user.children?.forEach(child => {
              if (!seen.has(child.name.trim())) {
                seen.add(child.name.trim())
                allChildren.push({ id: child.id, name: child.name.trim(), className: child.className, teacherName: (child as any).teacherName })
              }
            })
            return allChildren.length > 0 ? allChildren : null
          })() && (
            <div className="mt-6 pt-6" style={{ borderTop: '1px solid #F0E4E6' }}>
              <p className="text-sm font-bold mb-3" style={{ color: '#2D2225' }}>
                {t('settings.myChildren')}:
              </p>
              {(() => {
                const allChildren: Array<{ id: string; name: string; className: string; teacherName?: string }> = []
                const seen = new Set<string>()
                user.studentLinks?.forEach(link => {
                  const name = link.studentName.trim()
                  if (!seen.has(name)) {
                    seen.add(name)
                    allChildren.push({ id: link.studentId, name, className: link.className, teacherName: link.teacherName || undefined })
                  }
                })
                user.children?.forEach(child => {
                  const name = child.name.trim()
                  if (!seen.has(name)) {
                    seen.add(name)
                    allChildren.push({ id: child.id, name, className: child.className, teacherName: (child as any).teacherName })
                  }
                })
                return allChildren
              })().map((child, index) => {
                const childGroups = parentGroups.filter(g =>
                  g.children.some(c => c.studentName === child.name || c.studentId === child.id)
                )
                return (
                  <div key={child.id} className="mb-4 flex items-start space-x-3">
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '12px',
                        background: childGradients[index % childGradients.length],
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      {getInitials(child.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm" style={{ color: '#2D2225' }}>
                        {child.name}
                      </div>
                      <div className="text-xs" style={{ color: '#A8929A' }}>{child.className}</div>
                      {child.teacherName && (
                        <div className="text-xs" style={{ color: '#A8929A' }}>Teacher: {child.teacherName}</div>
                      )}
                      {childGroups.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {childGroups.map(g => (
                            <span
                              key={g.id}
                              className="inline-flex items-center text-xs px-2 py-0.5"
                              style={{
                                borderRadius: '8px',
                                backgroundColor: '#FFF8F4',
                                color: '#7A6469',
                              }}
                            >
                              {g.category?.icon || '\uD83D\uDC65'} {g.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Language Selector */}
          <div className="mt-6 pt-6" style={{ borderTop: '1px solid #F0E4E6' }}>
            <p className="text-sm font-bold mb-2" style={{ color: '#2D2225' }}>
              {t('settings.language')}
            </p>
            <div className="relative">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl"
                style={{
                  backgroundColor: '#FFF8F4',
                  border: '1px solid #F0E4E6',
                  minHeight: '48px',
                }}
                disabled={isUpdatingLanguage}
              >
                <div className="flex items-center space-x-2">
                  <Globe className="h-4 w-4" style={{ color: '#7A6469' }} />
                  <span className="text-sm font-semibold" style={{ color: '#2D2225' }}>{currentLanguage.name}</span>
                </div>
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{
                    color: '#A8929A',
                    transform: showLanguageDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>

              {showLanguageDropdown && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto z-10"
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    border: '1.5px solid #F0E4E6',
                    boxShadow: '0 4px 20px rgba(45, 34, 37, 0.08)',
                  }}
                >
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className="w-full text-left px-4 py-3 text-sm font-medium"
                      style={{
                        color: lang.code === user.preferredLanguage ? '#C4506E' : '#2D2225',
                        backgroundColor: lang.code === user.preferredLanguage ? '#FFF0F3' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (lang.code !== user.preferredLanguage) {
                          e.currentTarget.style.backgroundColor = '#FFF8F4'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (lang.code !== user.preferredLanguage) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Powered by Wasil */}
          <div className="mt-6 pt-4 pb-2 flex items-center justify-center gap-1.5" style={{ borderTop: '1px solid #F0E4E6' }}>
            <span className="text-[11px] font-medium" style={{ color: '#D8CDD0' }}>Powered by</span>
            <img
              src="/wasil-logo-grey.png"
              alt="Wasil"
              className="h-3 w-auto"
              style={{ opacity: 0.4 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
