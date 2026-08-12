import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from '@wasil/shared'
import { LayoutDashboard, LifeBuoy, Building2, AlertTriangle, ListChecks, ScrollText, Activity, Flag, Send, BookOpen, ArrowLeft, Command } from 'lucide-react'
import { CommandPalette } from './CommandPalette'
import { OverviewPage } from './OverviewPage'
import { ParentSupportPage } from './ParentSupportPage'
import { SystemHealthPage, IncidentsPage, JobsPage, FlagsPage, AuditPage, SchoolsPage, InvitationsPage, RunbooksPage } from './pages'

const NAV = [
  { to: '/ops', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/ops/support', label: 'Parent Support', icon: LifeBuoy },
  { to: '/ops/schools', label: 'School Health', icon: Building2 },
  { to: '/ops/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/ops/jobs', label: 'Background Jobs', icon: ListChecks },
  { to: '/ops/audit', label: 'Audit Explorer', icon: ScrollText },
  { to: '/ops/health', label: 'System Health', icon: Activity },
  { to: '/ops/flags', label: 'Feature Flags', icon: Flag },
  { to: '/ops/invitations', label: 'Invitations', icon: Send },
  { to: '/ops/runbooks', label: 'Runbooks', icon: BookOpen },
]

/**
 * Operations Console — "Mission Control". A self-contained dark shell (distinct
 * from the school-branded admin chrome) mounted at /ops/*, with a global command
 * palette. Reuses the platform's data layer (`api.ops`, `useApi`) and design-
 * system primitives (ConfirmModal, Toast). Every mutating action is audited and
 * tenant-scoped server-side; destructive ones are confirmed in the UI.
 */
export function OpsApp() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-sky-600 text-xs font-bold">W</div>
          <div className="text-sm font-semibold">Operations</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-sky-600/15 text-sky-300 ring-1 ring-sky-800' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => navigate('/analytics')} className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-800/60 hover:text-slate-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
        </button>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
          <div className="text-xs text-slate-500">Wasil Connect · internal</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <Command className="h-3 w-3" /> K
            </button>
            <span className="text-xs text-slate-400">{user?.name} · {user?.role}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="support" element={<ParentSupportPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="health" element={<SystemHealthPage />} />
            <Route path="flags" element={<FlagsPage />} />
            <Route path="invitations" element={<InvitationsPage />} />
            <Route path="runbooks" element={<RunbooksPage />} />
          </Routes>
        </main>
      </div>

      {/* Global ⌘K palette */}
      <CommandPalette />
    </div>
  )
}
