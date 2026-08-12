import { api, useApi } from '@wasil/shared'
import { AlertTriangle, Activity, RefreshCw } from 'lucide-react'
import { Card, PageHeader, Stat, StatusDot, Skeleton, Btn, relTime, useAutoRefresh, EmptyState } from './kit'

export function OverviewPage() {
  const metrics = useApi(() => api.ops.metrics(), [])
  const status = useApi(() => api.ops.status(), [])
  const incidents = useApi(() => api.ops.incidents(), [])
  const release = useApi(() => api.ops.release(), [])

  const refreshAll = () => { metrics.refetch(); status.refetch(); incidents.refetch(); release.refetch() }
  useAutoRefresh(refreshAll, 30000)

  const m = metrics.data
  const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`)

  return (
    <div>
      <PageHeader
        title="Mission Control"
        subtitle="Platform health, activation and delivery — auto-refreshing every 30s"
        right={<Btn onClick={refreshAll}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Btn>}
      />

      {/* Health banner */}
      <Card className="mb-5 flex items-center justify-between px-4 py-3">
        <span className="inline-flex items-center gap-2 text-slate-200">
          <Activity className="h-4 w-4 text-slate-400" />
          Platform status
        </span>
        {status.data ? <StatusDot state={status.data.overall} label={status.data.overall === 'ok' ? 'All systems operational' : status.data.overall} /> : <Skeleton className="h-4 w-40" />}
      </Card>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.isLoading || !m ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <Stat label="Parents" value={m.parents.total} sub={`${m.parents.invited} invited`} />
            <Stat label="Activated" value={m.parents.activated} sub={`${pct(m.parents.activationRatePct)} of invited`} tone={m.parents.activationRatePct !== null && m.parents.activationRatePct < 40 ? 'warn' : 'ok'} />
            <Stat label="Pending invites" value={m.parents.pendingInvitations} />
            <Stat label="Active today" value={m.activity.dailyActiveUsers} sub={`${m.activity.weeklyActiveUsers} this week`} />
            <Stat label="Logins 24h" value={m.auth.successfulLogins24h} sub={`${m.auth.failedVerifications24h} failed · ${m.auth.lockouts24h} lockouts`} tone={m.auth.lockouts24h >= 5 ? 'warn' : undefined} />
            <Stat label="Bookings 7d" value={m.bookings.created7d} sub={`${pct(m.bookings.cancellationRatePct)} cancelled`} />
            <Stat label="Notifications 24h" value={pct(m.notifications.successRatePct)} sub={`${m.notifications.sent24h} sent · ${m.notifications.failed24h} failed`} tone={m.notifications.failed24h > 0 ? 'warn' : 'ok'} />
            <Stat label="Queue" value={m.queue.depth} sub={`${m.queue.failedJobs} failed`} tone={m.queue.failedJobs > 0 ? 'bad' : 'ok'} />
          </>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Incidents */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Active incidents
          </div>
          {incidents.isLoading ? <Skeleton className="h-16" /> : (incidents.data?.incidents.length ?? 0) === 0 ? (
            <EmptyState>No active incidents.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {incidents.data!.incidents.map((inc) => (
                <li key={inc.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-200">{inc.title}</span>
                    <StatusDot state={inc.severity} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Affects {inc.affected} · {inc.suggestedAction}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* System status grid */}
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">Dependencies</div>
          {status.isLoading || !status.data ? <Skeleton className="h-40" /> : (
            <ul className="grid grid-cols-2 gap-2">
              {status.data.components.map((c) => (
                <li key={c.component} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-2.5 py-2">
                  <span className="truncate text-xs text-slate-300" title={c.detail}>{c.component}</span>
                  <StatusDot state={c.state} label="" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Release footer */}
      {release.data && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>env <span className="text-slate-300">{release.data.environment}</span></span>
          <span>commit <span className="text-slate-300">{release.data.commit?.slice(0, 8) ?? '—'}</span></span>
          <span>migration <span className="text-slate-300">{release.data.migration ?? '—'}</span></span>
          <span>Sentry <span className="text-slate-300">{release.data.sentryConfigured ? 'on' : 'off'}</span></span>
          <span>up since <span className="text-slate-300">{relTime(release.data.startedAt)}</span></span>
        </div>
      )}
    </div>
  )
}
