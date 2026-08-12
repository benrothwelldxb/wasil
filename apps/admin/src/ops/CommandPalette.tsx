import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useToast, type OpsSearchResult } from '@wasil/shared'
import { Search, CornerDownLeft, Mail, Link2, User, LayoutGrid } from 'lucide-react'
import { Badge, Highlight } from './kit'

/**
 * Global command palette (⌘K / Ctrl+K) — the fastest way to navigate the console
 * and jump to a parent. Fuzzy-filters navigation commands and live-searches
 * parents (debounced). Keyboard-first: ↑/↓ to move, ↵ to run, Esc to close.
 * Safe quick actions (resend invite, copy login link) are inline on a parent
 * row; destructive actions live one keystroke away on the parent page (behind a
 * confirmation), so nothing irreversible fires from a fuzzy match.
 */

interface NavCmd { id: string; label: string; hint: string; path: string }
const NAV: NavCmd[] = [
  { id: 'overview', label: 'Overview', hint: 'Mission Control', path: '/ops' },
  { id: 'support', label: 'Parent Support', hint: 'search + actions', path: '/ops/support' },
  { id: 'schools', label: 'School Health', hint: 'per-school', path: '/ops/schools' },
  { id: 'incidents', label: 'Incident Centre', hint: 'active issues', path: '/ops/incidents' },
  { id: 'jobs', label: 'Background Jobs', hint: 'queue + retry', path: '/ops/jobs' },
  { id: 'audit', label: 'Audit Explorer', hint: 'who did what', path: '/ops/audit' },
  { id: 'health', label: 'System Health', hint: 'dependencies', path: '/ops/health' },
  { id: 'flags', label: 'Feature Flags', hint: 'kill-switches', path: '/ops/flags' },
  { id: 'invites', label: 'Invitation Centre', hint: 'activation funnel', path: '/ops/invitations' },
  { id: 'runbooks', label: 'Runbooks', hint: 'how to fix it', path: '/ops/runbooks' },
]

export function CommandPalette() {
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [parents, setParents] = useState<OpsSearchResult[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(id) }, [q])

  // Live parent search.
  useEffect(() => {
    let cancelled = false
    if (debounced.length < 2) { setParents([]); return }
    api.ops.searchParents(debounced).then((r) => { if (!cancelled) setParents(r.results.slice(0, 6)) }).catch(() => {})
    return () => { cancelled = true }
  }, [debounced])

  const navMatches = useMemo(
    () => NAV.filter((c) => (c.label + c.hint + c.id).toLowerCase().includes(q.toLowerCase())),
    [q],
  )
  // Flattened, keyboard-navigable list: nav commands then parent "open" rows.
  const rows = useMemo(
    () => [
      ...navMatches.map((c) => ({ kind: 'nav' as const, key: c.id, cmd: c })),
      ...parents.map((p) => ({ kind: 'parent' as const, key: p.id, parent: p })),
    ],
    [navMatches, parents],
  )
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, rows.length - 1))) }, [rows.length])

  if (!open) return null

  const runRow = (i: number) => {
    const row = rows[i]
    if (!row) return
    if (row.kind === 'nav') { navigate(row.cmd.path); setOpen(false) }
    else { navigate(`/ops/support?id=${row.parent.id}`); setOpen(false) }
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); runRow(active) }
  }
  const quick = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok) } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-800 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search pages, or a parent by name / email / child…"
            className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
          <kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches.</li>}
          {rows.map((row, i) => (
            <li key={row.kind + row.key}>
              <div
                onMouseEnter={() => setActive(i)}
                onClick={() => runRow(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 ${active === i ? 'bg-sky-600/20 ring-1 ring-sky-700' : 'hover:bg-slate-800/60'}`}
              >
                {row.kind === 'nav' ? (
                  <>
                    <span className="flex items-center gap-2 text-sm text-slate-100"><LayoutGrid className="h-3.5 w-3.5 text-slate-500" /><Highlight text={row.cmd.label} q={q} /></span>
                    <span className="text-xs text-slate-500">{row.cmd.hint}</span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm text-slate-100"><User className="h-3.5 w-3.5 text-slate-500" /><span className="truncate"><Highlight text={row.parent.name} q={debounced} /></span>
                        {row.parent.activated ? <Badge tone="green">active</Badge> : row.parent.invited ? <Badge tone="amber">invited</Badge> : <Badge>new</Badge>}</span>
                      <span className="ml-5 block truncate text-xs text-slate-500">{row.parent.email}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button title="Resend invite" onClick={(e) => { e.stopPropagation(); quick(() => api.ops.resendInvite(row.parent.id), 'Invitation re-sent') }} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"><Mail className="h-3.5 w-3.5" /></button>
                      <button title="Copy login link" onClick={(e) => { e.stopPropagation(); quick(async () => { const { url } = await api.ops.magicLink(row.parent.id); await navigator.clipboard?.writeText(url) }, 'Login link copied') }} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-100"><Link2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span>
          <span>↑↓ navigate</span>
          <span>destructive actions are confirmed on the parent page</span>
        </div>
      </div>
    </div>
  )
}
