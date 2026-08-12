import { useState } from 'react'
import { api, useApi, useToast } from '@wasil/shared'
import { RefreshCw, BookOpen } from 'lucide-react'
import { Card, PageHeader, Stat, StatusDot, Skeleton, Btn, Table, Th, Td, Badge, relTime, EmptyState, useAutoRefresh } from './kit'

// ── System Health ────────────────────────────────────────────────────────────
export function SystemHealthPage() {
  const status = useApi(() => api.ops.status(), [])
  useAutoRefresh(status.refetch, 20000)
  return (
    <div>
      <PageHeader title="System Health" subtitle="Live dependency status" right={<Btn onClick={status.refetch}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Btn>} />
      {status.isLoading || !status.data ? <Skeleton className="h-64" /> : (
        <Card className="divide-y divide-slate-800/70">
          {status.data.components.map((c) => (
            <div key={c.component} className="flex items-center justify-between px-4 py-3">
              <div><div className="text-sm text-slate-200">{c.component}</div><div className="text-xs text-slate-500">{c.detail}</div></div>
              <StatusDot state={c.state} />
            </div>
          ))}
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-600">Historical uptime is not yet recorded — status is point-in-time. See OPERATIONS_CONSOLE.md → Future improvements.</p>
    </div>
  )
}

// ── Incidents ────────────────────────────────────────────────────────────────
export function IncidentsPage() {
  const inc = useApi(() => api.ops.incidents(), [])
  useAutoRefresh(inc.refetch, 30000)
  return (
    <div>
      <PageHeader title="Incident Centre" subtitle="Derived from live health + metrics" />
      {inc.isLoading ? <Skeleton className="h-32" /> : (inc.data?.incidents.length ?? 0) === 0 ? (
        <Card className="p-10"><EmptyState>No active incidents. 🎉</EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {inc.data!.incidents.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-100">{i.title}</span>
                <StatusDot state={i.severity} />
              </div>
              <div className="mt-1 text-sm text-slate-400">Affects: {i.affected}</div>
              <div className="mt-1 text-sm text-slate-300">→ {i.suggestedAction}</div>
              <div className="mt-2 text-xs text-slate-500">Runbook: {i.runbook}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Background Jobs ──────────────────────────────────────────────────────────
export function JobsPage() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const jobs = useApi(() => api.ops.jobs(), [])
  useAutoRefresh(jobs.refetch, 15000)

  const retry = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); jobs.refetch() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Retry failed') }
    finally { setBusy(false) }
  }
  const summary = jobs.data?.summary ?? {}
  return (
    <div>
      <PageHeader title="Background Jobs" subtitle="Outbox queue — delivery of email / push / SMS"
        right={<Btn tone="primary" disabled={busy || (summary.FAILED ?? 0) === 0} onClick={() => retry(() => api.ops.retryFailedJobs(), 'Retrying all failed jobs')}><RefreshCw className="h-3.5 w-3.5" /> Retry all failed</Btn>} />
      <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-4">
        <Stat label="Pending" value={summary.PENDING ?? 0} />
        <Stat label="Sent" value={summary.SENT ?? 0} tone="ok" />
        <Stat label="Failed" value={summary.FAILED ?? 0} tone={(summary.FAILED ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>
      <Card className="p-2">
        {jobs.isLoading ? <Skeleton className="h-40" /> : (jobs.data?.entries.length ?? 0) === 0 ? <EmptyState>No jobs.</EmptyState> : (
          <Table head={<><Th>Kind</Th><Th>Status</Th><Th>Attempts</Th><Th>Error</Th><Th>When</Th><Th /></>}>
            {jobs.data!.entries.map((j) => (
              <tr key={j.id}>
                <Td className="text-slate-200">{j.kind}</Td>
                <Td><Badge tone={j.status === 'FAILED' ? 'red' : j.status === 'SENT' ? 'green' : 'amber'}>{j.status}</Badge></Td>
                <Td>{j.attempts}</Td>
                <Td className="max-w-[240px] truncate" >{j.lastError ?? '—'}</Td>
                <Td>{relTime(j.createdAt)}</Td>
                <Td>{j.status === 'FAILED' && <Btn disabled={busy} onClick={() => retry(() => api.ops.retryJob(j.id), 'Job re-queued')}>Retry</Btn>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}

// ── Feature Flags ────────────────────────────────────────────────────────────
export function FlagsPage() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const flags = useApi(() => api.ops.flags(), [])
  const toggle = async (key: string, next: boolean) => {
    setBusy(key)
    try { await api.ops.setFlagGlobal(key, next); toast.success(`${key} ${next ? 'enabled' : 'disabled'} globally`); flags.refetch() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Update failed (super-admin only)') }
    finally { setBusy(null) }
  }
  return (
    <div>
      <PageHeader title="Feature Flags" subtitle="Global kill-switches (school / user overrides via API). Changes are audited." />
      {flags.isLoading ? <Skeleton className="h-48" /> : (
        <Card className="divide-y divide-slate-800/70">
          {flags.data!.flags.map((f) => (
            <div key={f.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-slate-200">{f.key} {f.overrides.length > 0 && <Badge tone="sky">{f.overrides.length} override{f.overrides.length > 1 ? 's' : ''}</Badge>}</div>
                <div className="text-xs text-slate-500">{f.description ?? ''}</div>
              </div>
              <button
                role="switch" aria-checked={f.enabledDefault} disabled={busy === f.key}
                onClick={() => toggle(f.key, !f.enabledDefault)}
                className={`relative h-6 w-11 rounded-full transition-colors ${f.enabledDefault ? 'bg-emerald-600' : 'bg-slate-700'} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${f.enabledDefault ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// ── Audit Explorer ───────────────────────────────────────────────────────────
export function AuditPage() {
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [applied, setApplied] = useState<{ userId?: string; action?: string }>({})
  const audit = useApi(() => api.ops.audit({ ...applied, limit: 200 }), [applied])
  return (
    <div>
      <PageHeader title="Audit Explorer" subtitle="Unified authentication + business audit trail" />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Parent/User ID" className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-600" />
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action (e.g. verify_failed)" className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-600" />
        <Btn tone="primary" onClick={() => setApplied({ userId: userId || undefined, action: action || undefined })}>Search</Btn>
      </div>
      <Card className="p-2">
        {audit.isLoading ? <Skeleton className="h-64" /> : (audit.data?.rows.length ?? 0) === 0 ? <EmptyState>No matching audit events.</EmptyState> : (
          <Table head={<><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Detail</Th><Th>IP</Th><Th>Src</Th></>}>
            {audit.data!.rows.map((r, i) => (
              <tr key={i}>
                <Td>{relTime(r.at)}</Td>
                <Td className="max-w-[180px] truncate text-slate-200">{r.who ?? '—'}</Td>
                <Td>{r.action}</Td>
                <Td className="max-w-[280px] truncate">{r.detail ?? '—'}</Td>
                <Td>{r.ip ?? '—'}</Td>
                <Td><Badge tone={r.source === 'auth' ? 'sky' : 'slate'}>{r.source}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}

// ── Schools ──────────────────────────────────────────────────────────────────
export function SchoolsPage() {
  const schools = useApi(() => api.ops.schools(), [])
  return (
    <div>
      <PageHeader title="School Health" subtitle="Per-school activation and queue health" />
      <Card className="p-2">
        {schools.isLoading ? <Skeleton className="h-48" /> : (schools.data?.schools.length ?? 0) === 0 ? <EmptyState>No schools in scope.</EmptyState> : (
          <Table head={<><Th>School</Th><Th>Parents</Th><Th>Activated</Th><Th>Pending</Th><Th>Failed jobs</Th><Th>Last activity</Th></>}>
            {schools.data!.schools.map((s) => (
              <tr key={s.id}>
                <Td className="text-slate-200">{s.name}</Td>
                <Td>{s.parents}</Td>
                <Td>{s.activated} <span className="text-slate-500">({s.activatedPct ?? '—'}%)</span></Td>
                <Td>{s.pendingInvites}</Td>
                <Td>{s.failedJobs > 0 ? <Badge tone="red">{s.failedJobs}</Badge> : '0'}</Td>
                <Td>{relTime(s.lastActivityAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}

// ── Invitation Centre ────────────────────────────────────────────────────────
export function InvitationsPage() {
  const m = useApi(() => api.ops.metrics(), [])
  const d = m.data
  return (
    <div>
      <PageHeader title="Invitation Centre" subtitle="Activation funnel" />
      {m.isLoading || !d ? <Skeleton className="h-24" /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Invited (sent)" value={d.parents.invited} />
          <Stat label="Activated" value={d.parents.activated} tone="ok" />
          <Stat label="Pending" value={d.parents.pendingInvitations} tone="warn" />
          <Stat label="Activation rate" value={`${d.parents.activationRatePct ?? '—'}%`} />
        </div>
      )}
      <p className="mt-4 text-xs text-slate-600">
        Delivered / opened / bounce rates require email-provider (Resend) webhooks, which are not yet wired — the funnel
        currently reports <span className="text-slate-400">sent</span> (welcome email) and <span className="text-slate-400">activated</span> (first login).
        Per-parent resend lives on the Parent Support page. See OPERATIONS_CONSOLE.md → Future improvements.
      </p>
    </div>
  )
}

// ── Runbooks ─────────────────────────────────────────────────────────────────
const RUNBOOKS: Array<{ title: string; symptom: string; first: string }> = [
  { title: 'Parent cannot log in', symptom: 'Code rejected / not arriving / locked', first: 'Open the parent → check locked + auth history → Unlock / Copy login link' },
  { title: 'Invitation not received', symptom: 'No welcome/code email', first: 'Check System Health → Email; resend from Parent Support' },
  { title: 'Booking failed', symptom: 'Cannot book a club/consultation', first: 'Check the clubs/consultations flag + parent bookings' },
  { title: 'Notification failed', symptom: 'Parents not receiving push/email', first: 'Background Jobs → failed entries → Retry; check the provider' },
  { title: 'Queue backlog', symptom: 'Queue depth high / worker stalled', first: 'Background Jobs; restart the worker if oldest-pending climbs' },
  { title: 'Database outage', symptom: '/health/ready = 503, broad 500s', first: 'Check DB provider / failover; LB drains automatically' },
  { title: 'Email outage', symptom: 'Email red; no codes/invites', first: 'Fix RESEND_API_KEY/domain; publish an announcement' },
  { title: 'Deployment rollback', symptom: 'Errors spike after a deploy', first: 'Filter Sentry by release; redeploy the previous build' },
]
export function RunbooksPage() {
  const [q, setQ] = useState('')
  const filtered = RUNBOOKS.filter((r) => (r.title + r.symptom).toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <PageHeader title="Runbooks" subtitle="Quick reference — full detail in OPERATIONS.md" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search runbooks…" className="mb-4 w-full max-w-md rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-600" />
      <div className="space-y-2">
        {filtered.map((r) => (
          <Card key={r.title} className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-100"><BookOpen className="h-4 w-4 text-slate-500" /> {r.title}</div>
            <div className="mt-1 text-xs text-slate-500">Symptom: {r.symptom}</div>
            <div className="mt-1 text-sm text-slate-300">→ {r.first}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}
