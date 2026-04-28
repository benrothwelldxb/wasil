import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  ClipboardList,
  Calendar,
  Newspaper,
  CalendarDays,
  Activity,
  Clock,
  Layers,
  Users,
  GraduationCap,
  UserCog,
  UserPlus,
  FileText,
  FolderOpen,
  ExternalLink,
  BookOpen,
  Building,
  Shield,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  UsersRound,
  Sparkles,
  CalendarCheck,
  BarChart3,
  AlertTriangle,
  Inbox,
  UtensilsCrossed,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { useAuth, useTheme, config } from '@wasil/shared'
import * as api from '@wasil/shared'

interface NavItem {
  icon: LucideIcon
  label: string
  path: string
  superAdminOnly?: boolean
  badgeKey?: string
}

interface NavSection {
  label: string
  items: NavItem[]
  defaultOpen?: boolean
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Communication',
    defaultOpen: true,
    items: [
      { icon: Inbox, label: 'Inbox', path: '/inbox', badgeKey: 'inbox' },
      { icon: MessageSquare, label: 'Posts', path: '/messages' },
      { icon: AlertTriangle, label: 'Emergency Alerts', path: '/emergency-alerts' },
    ],
  },
  {
    label: 'Engagement',
    defaultOpen: true,
    items: [
      { icon: ClipboardList, label: 'Forms', path: '/forms' },
      { icon: Calendar, label: 'Events', path: '/events' },
      { icon: Newspaper, label: 'Weekly Updates', path: '/weekly' },
      { icon: Activity, label: 'Parent Pulse', path: '/pulse' },
    ],
  },
  {
    label: 'Programmes',
    defaultOpen: true,
    items: [
      { icon: Sparkles, label: 'Activities (ECA)', path: '/eca' },
      { icon: CalendarCheck, label: 'Consultations', path: '/consultations' },
      { icon: Clock, label: 'School Services', path: '/school-services' },
      { icon: UtensilsCrossed, label: 'Lunch Menu', path: '/cafeteria' },
    ],
  },
  {
    label: 'Calendar',
    defaultOpen: false,
    items: [
      { icon: CalendarDays, label: 'Term Dates', path: '/term-dates' },
      { icon: Clock, label: 'Schedule', path: '/schedule' },
    ],
  },
  {
    label: 'People',
    defaultOpen: false,
    items: [
      { icon: GraduationCap, label: 'Students', path: '/students' },
      { icon: UserCog, label: 'Staff', path: '/staff' },
      { icon: UserPlus, label: 'Parents', path: '/parents' },
    ],
  },
  {
    label: 'School Setup',
    defaultOpen: false,
    items: [
      { icon: Layers, label: 'Year Groups', path: '/year-groups' },
      { icon: Users, label: 'Classes', path: '/classes' },
      { icon: UsersRound, label: 'Groups', path: '/groups' },
    ],
  },
  {
    label: 'Resources',
    defaultOpen: false,
    items: [
      { icon: FileText, label: 'Policies', path: '/policies' },
      { icon: FolderOpen, label: 'Files', path: '/files' },
      { icon: ExternalLink, label: 'Links', path: '/links' },
      { icon: BookOpen, label: 'Knowledge Base', path: '/knowledge-base' },
    ],
  },
  {
    label: 'System',
    defaultOpen: false,
    items: [
      { icon: BarChart3, label: 'Analytics', path: '/analytics' },
      { icon: Shield, label: 'Audit Log', path: '/audit-log' },
      { icon: Building, label: 'Schools', path: '/schools', superAdminOnly: true },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

function loadCollapsedSections(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem('sidebarSections')
    return stored ? JSON.parse(stored) : {}
  } catch { return {} }
}

function saveCollapsedSections(state: Record<string, boolean>) {
  localStorage.setItem('sidebarSections', JSON.stringify(state))
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [inboxUnread, setInboxUnread] = useState(0)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const stored = loadCollapsedSections()
    // Apply defaults for sections not in storage
    const initial: Record<string, boolean> = {}
    NAV_SECTIONS.forEach(s => {
      initial[s.label] = stored[s.label] !== undefined ? stored[s.label] : !s.defaultOpen
    })
    return initial
  })

  // Poll inbox unread count
  useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      try {
        const result = await api.inbox.unreadCount()
        setInboxUnread(result.count)
      } catch { /* ignore */ }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user])

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [label]: !prev[label] }
      saveCollapsedSections(next)
      return next
    })
  }

  // Auto-expand section if active route is inside it
  useEffect(() => {
    const path = window.location.pathname
    NAV_SECTIONS.forEach(section => {
      if (section.items.some(item => path.startsWith(item.path))) {
        setCollapsedSections(prev => {
          if (prev[section.label]) {
            const next = { ...prev, [section.label]: false }
            saveCollapsedSections(next)
            return next
          }
          return prev
        })
      }
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen flex flex-col z-30 transition-all duration-300 ease-in-out text-white ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{ backgroundColor: '#2D2225' }}
    >
      {/* Brand header */}
      <div className="h-16 flex items-center px-4 border-b border-white/10 shrink-0">
        <img
          src="/wasil-icon-grey.png"
          alt="Wasil"
          className="w-9 h-9 rounded-lg shrink-0 object-contain brightness-0 invert"
        />
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <p className="text-sm font-extrabold text-white truncate leading-tight">
              {theme.schoolName}
            </p>
            <p className="text-[11px] text-white/50 truncate leading-tight">
              Admin Dashboard
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2.5" role="navigation" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            item => !item.superAdminOnly || user?.role === 'SUPER_ADMIN'
          )
          if (visibleItems.length === 0) return null

          const isSectionCollapsed = collapsedSections[section.label] && !collapsed

          return (
            <div key={section.label} className="mb-1">
              {/* Section header */}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center justify-between px-3 py-1.5 mb-0.5 group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 group-hover:text-white/50 transition-colors">
                    {section.label}
                  </span>
                  <ChevronDown
                    className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-all"
                    style={{
                      transform: isSectionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
              )}

              {/* Section items */}
              {!isSectionCollapsed && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `group relative flex items-center rounded-xl transition-all duration-150 ${
                          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
                        } ${
                          isActive
                            ? 'text-white shadow-sm'
                            : 'text-white/50 hover:text-white hover:bg-white/10'
                        }`
                      }
                      style={({ isActive }) =>
                        isActive ? { backgroundColor: '#C4506E' } : undefined
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon
                        className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`}
                        strokeWidth={1.8}
                      />
                      {!collapsed && (
                        <span className="ml-3 text-[13px] font-medium truncate flex-1">
                          {item.label}
                        </span>
                      )}
                      {item.badgeKey === 'inbox' && inboxUnread > 0 && (
                        <span
                          className="shrink-0 flex items-center justify-center rounded-full text-white text-[10px] font-bold"
                          style={{
                            backgroundColor: '#C4506E',
                            width: inboxUnread > 9 ? '20px' : '18px',
                            height: '18px',
                            marginLeft: collapsed ? '-4px' : '0',
                            marginTop: collapsed ? '-8px' : '0',
                            position: collapsed ? 'absolute' : 'relative',
                            top: collapsed ? '4px' : 'auto',
                            right: collapsed ? '4px' : 'auto',
                          }}
                        >
                          {inboxUnread > 9 ? '9+' : inboxUnread}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-2.5 space-y-1 shrink-0">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Logout' : undefined}
          aria-label="Logout"
        >
          <LogOut className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`} strokeWidth={1.8} />
          {!collapsed && (
            <span className="ml-3 text-[13px] font-medium">Logout</span>
          )}
        </button>

        <button
          onClick={onToggle}
          className={`w-full flex items-center rounded-xl text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          ) : (
            <>
              <ChevronsLeft className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
              <span className="ml-3 text-[13px] font-medium">Collapse</span>
            </>
          )}
        </button>

        {/* Powered by Wasil */}
        {config.defaultSchool.showWasilBranding && (
          <div className={`flex items-center ${collapsed ? 'justify-center pt-2' : 'px-3 pt-2'}`}>
            {collapsed ? (
              <img
                src={config.defaultSchool.wasilIcon}
                alt="Wasil"
                className="w-5 h-5 opacity-30 brightness-0 invert"
              />
            ) : (
              <div className="flex items-center gap-1.5 opacity-30">
                <span className="text-[10px] text-white/50">Powered by</span>
                <img
                  src={config.defaultSchool.wasilLogoGrey}
                  alt="Wasil"
                  className="h-3 w-auto brightness-0 invert"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
