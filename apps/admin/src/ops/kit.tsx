import React, { useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { ComponentState } from '@wasil/shared'

/**
 * Operations Console UI kit — a small set of dark-first primitives so the pages
 * stay short and visually consistent (Linear/Vercel-ish internal-tool chrome).
 * Deliberately self-contained dark styling: this is an engineer-facing control
 * centre, distinct from the school-branded parent/admin surfaces. Light mode is
 * a documented fast-follow (see OPERATIONS_CONSOLE.md).
 */

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneClass = tone === 'bad' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-emerald-400' : 'text-slate-100'
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}

const STATE_STYLE: Record<ComponentState | 'critical' | 'warning' | 'info', { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Healthy' },
  degraded: { dot: 'bg-amber-400', text: 'text-amber-400', label: 'Warning' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-400', label: 'Warning' },
  down: { dot: 'bg-rose-500', text: 'text-rose-400', label: 'Critical' },
  critical: { dot: 'bg-rose-500', text: 'text-rose-400', label: 'Critical' },
  not_configured: { dot: 'bg-slate-600', text: 'text-slate-500', label: 'Not configured' },
  info: { dot: 'bg-sky-400', text: 'text-sky-400', label: 'Info' },
}

export function StatusDot({ state, label }: { state: ComponentState | 'critical' | 'warning' | 'info'; label?: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.info
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      <span className={`text-xs ${s.text}`}>{label ?? s.label}</span>
    </span>
  )
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'sky' }) {
  const map = {
    slate: 'bg-slate-800 text-slate-300', green: 'bg-emerald-500/15 text-emerald-400',
    red: 'bg-rose-500/15 text-rose-400', amber: 'bg-amber-500/15 text-amber-400', sky: 'bg-sky-500/15 text-sky-400',
  }
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-800/70 ${className}`} />
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500">{children}</div>
}

export function Btn({ children, onClick, tone = 'default', disabled, title }: { children: React.ReactNode; onClick?: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean; title?: string }) {
  const map = {
    default: 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200',
    primary: 'border-sky-600 bg-sky-600 hover:bg-sky-500 text-white',
    danger: 'border-rose-700 bg-rose-600/90 hover:bg-rose-600 text-white',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${map[tone]}`}>
      {children}
    </button>
  )
}

/** Simple dark table. */
export function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">{head}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  )
}
export const Th = ({ children }: { children?: React.ReactNode }) => <th className="px-3 py-2 font-medium">{children}</th>
export const Td = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => <td className={`px-3 py-2 text-slate-300 ${className}`}>{children}</td>

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return '—' }
}

/** Auto-refresh a `refetch` on an interval, paused when the tab is hidden. */
export function useAutoRefresh(refetch: () => void, ms = 30000) {
  const ref = useRef(refetch)
  ref.current = refetch
  useEffect(() => {
    const tick = () => { if (!document.hidden) ref.current() }
    const id = window.setInterval(tick, ms)
    return () => window.clearInterval(id)
  }, [ms])
}

/** Highlight the matched substring in a search result. */
export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="bg-amber-400/30 text-amber-200 rounded-sm">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}
