import React, { useState } from 'react'
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
  BookOpen,
  Building,
  Shield,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useAuth, useTheme, config } from '@wasil/shared'

interface NavItem {
  icon: LucideIcon
  label: string
  path: string
  superAdminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: MessageSquare, label: 'Messages', path: '/messages' },
  { icon: ClipboardList, label: 'Forms', path: '/forms' },
  { icon: Calendar, label: 'Events', path: '/events' },
  { icon: Newspaper, label: 'Weekly Updates', path: '/weekly' },
  { icon: CalendarDays, label: 'Term Dates', path: '/term-dates' },
  { icon: Activity, label: 'Parent Pulse', path: '/pulse' },
  { icon: Clock, label: 'Schedule', path: '/schedule' },
  { icon: Layers, label: 'Year Groups', path: '/year-groups' },
  { icon: Users, label: 'Classes', path: '/classes' },
  { icon: GraduationCap, label: 'Students', path: '/students' },
  { icon: UserCog, label: 'Staff', path: '/staff' },
  { icon: UserPlus, label: 'Parents', path: '/parents' },
  { icon: FileText, label: 'Policies', path: '/policies' },
  { icon: FolderOpen, label: 'Files', path: '/files' },
  { icon: BookOpen, label: 'Knowledge Base', path: '/knowledge-base' },
  { icon: Shield, label: 'Audit Log', path: '/audit-log' },
  { icon: Building, label: 'Schools', path: '/schools', superAdminOnly: true },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()

  const filteredItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || user?.role === 'SUPER_ADMIN'
  )

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-slate-200/80 flex flex-col z-30 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-100 shrink-0">
        <img
          src="/wasil-icon-grey.png"
          alt="Wasil"
          className="w-9 h-9 rounded-lg shrink-0 object-contain"
        />
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
              {theme.schoolName}
            </p>
            <p className="text-[11px] text-slate-400 truncate leading-tight">
              Admin Dashboard
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        <div className="space-y-0.5">
          {filteredItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group flex items-center rounded-lg transition-all duration-150 ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
                } ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
              style={({ isActive }) =>
                isActive ? { backgroundColor: theme.colors.brandColor } : undefined
              }
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`}
                strokeWidth={1.8}
              />
              {!collapsed && (
                <span className="ml-3 text-[13px] font-medium truncate">
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-slate-100 p-2.5 space-y-1 shrink-0">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'}`} strokeWidth={1.8} />
          {!collapsed && (
            <span className="ml-3 text-[13px] font-medium">Logout</span>
          )}
        </button>

        <button
          onClick={onToggle}
          className={`w-full flex items-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                className="w-5 h-5 opacity-40"
              />
            ) : (
              <div className="flex items-center gap-1.5 opacity-40">
                <span className="text-[10px] text-slate-400">Powered by</span>
                <img
                  src={config.defaultSchool.wasilLogoGrey}
                  alt="Wasil"
                  className="h-3 w-auto"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
