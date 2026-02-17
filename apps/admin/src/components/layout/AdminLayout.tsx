import React, { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import { useAuth, useTheme } from '@wasil/shared'
import { Sidebar } from './Sidebar'

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAuth()
  const theme = useTheme()

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* Main area */}
      <div
        className="transition-all duration-300 ease-in-out"
        style={{ marginLeft: collapsed ? 68 : 260 }}
      >
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200/80 sticky top-0 z-20 flex items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <h1 className="text-[15px] font-semibold text-slate-800">
              {theme.schoolName}
            </h1>
            <span className="text-slate-300">|</span>
            <span className="text-[13px] text-slate-400">
              {theme.city}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* User info */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-[13px] font-medium text-slate-700 leading-tight">
                  {user?.name}
                </p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin' : 'Staff'}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  initials
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
