import prisma from './prisma.js'
import { getSystemStatus } from './systemStatus.js'
import { getBetaMetrics } from './opsMetrics.js'

/**
 * Read-only operational queries backing the console's School Health, Audit
 * Explorer, Background Jobs, Incident Centre and Release panels. Everything is
 * tenant-scoped by the caller passing a resolved `schoolId` (null = platform,
 * super-admin only).
 */

// ── Module 2: school health rollup ───────────────────────────────────────────
export interface SchoolHealth {
  id: string
  name: string
  parents: number
  activated: number
  activatedPct: number | null
  pendingInvites: number
  failedJobs: number
  lastActivityAt: string | null
}

export async function getSchoolHealth(scopeSchoolId: string | null): Promise<SchoolHealth[]> {
  const schools = await prisma.school.findMany({
    where: scopeSchoolId ? { id: scopeSchoolId } : {},
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 200,
  })
  return Promise.all(
    schools.map(async (s) => {
      const [parents, activated, invited, failedJobs, lastEvent] = await Promise.all([
        prisma.user.count({ where: { schoolId: s.id, role: 'PARENT' } }),
        prisma.user.count({ where: { schoolId: s.id, role: 'PARENT', lastLoginAt: { not: null } } }),
        prisma.user.count({ where: { schoolId: s.id, role: 'PARENT', welcomeSentAt: { not: null } } }),
        prisma.outboxEntry.count({ where: { schoolId: s.id, status: 'FAILED' } }),
        prisma.authEvent.findFirst({ where: { schoolId: s.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ])
      return {
        id: s.id, name: s.name,
        parents, activated,
        activatedPct: invited > 0 ? Math.round((activated / invited) * 1000) / 10 : null,
        pendingInvites: Math.max(0, invited - activated),
        failedJobs,
        lastActivityAt: lastEvent?.createdAt.toISOString() ?? null,
      }
    }),
  )
}

// ── Module 9: audit explorer (AuthEvent + AuditLog, unified) ──────────────────
export interface AuditRow {
  source: 'auth' | 'business'
  at: string
  who: string | null
  action: string
  detail: string | null
  ip: string | null
  schoolId: string | null
}

export async function searchAudit(opts: {
  scopeSchoolId: string | null
  userId?: string
  action?: string
  from?: Date
  to?: Date
  limit?: number
}): Promise<AuditRow[]> {
  const limit = Math.min(opts.limit ?? 100, 500)
  const created = { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) }
  const hasRange = opts.from || opts.to

  const [authEvents, auditLogs] = await Promise.all([
    prisma.authEvent.findMany({
      where: {
        ...(opts.scopeSchoolId ? { schoolId: opts.scopeSchoolId } : {}),
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.action ? { event: opts.action } : {}),
        ...(hasRange ? { createdAt: created } : {}),
      },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { event: true, userId: true, email: true, ipAddress: true, schoolId: true, createdAt: true, metadata: true },
    }),
    prisma.auditLog.findMany({
      where: {
        ...(opts.scopeSchoolId ? { schoolId: opts.scopeSchoolId } : {}),
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(hasRange ? { createdAt: created } : {}),
      },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { action: true, resourceType: true, resourceId: true, userId: true, userName: true, ipAddress: true, schoolId: true, createdAt: true },
    }),
  ])

  const rows: AuditRow[] = [
    ...authEvents.map((e): AuditRow => ({
      source: 'auth', at: e.createdAt.toISOString(), who: e.email ?? e.userId,
      action: e.event, detail: e.metadata ? JSON.stringify(e.metadata) : null,
      ip: e.ipAddress, schoolId: e.schoolId,
    })),
    ...auditLogs.map((a): AuditRow => ({
      source: 'business', at: a.createdAt.toISOString(), who: a.userName ?? a.userId,
      action: `${a.action} ${a.resourceType}`, detail: a.resourceId,
      ip: a.ipAddress, schoolId: a.schoolId,
    })),
  ]
  rows.sort((x, y) => (x.at < y.at ? 1 : -1))
  return rows.slice(0, limit)
}

// ── Module 7: background jobs (outbox) ────────────────────────────────────────
export async function listJobs(scopeSchoolId: string | null, status?: string) {
  const where = { ...(scopeSchoolId ? { schoolId: scopeSchoolId } : {}), ...(status ? { status: status as never } : {}) }
  const [summary, entries] = await Promise.all([
    prisma.outboxEntry.groupBy({ by: ['status'], where: scopeSchoolId ? { schoolId: scopeSchoolId } : {}, _count: { _all: true } }),
    prisma.outboxEntry.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, kind: true, status: true, attempts: true, lastError: true, runAfter: true, failedAt: true, createdAt: true, schoolId: true },
    }),
  ])
  const counts: Record<string, number> = {}
  for (const s of summary) counts[String(s.status)] = s._count._all
  return { summary: counts, entries }
}

/** Retry one FAILED job (tenant-checked): reset to PENDING and make it runnable now. */
export async function retryJob(scopeSchoolId: string | null, id: string): Promise<{ retried: boolean }> {
  const entry = await prisma.outboxEntry.findUnique({ where: { id }, select: { schoolId: true } })
  if (!entry) return { retried: false }
  if (scopeSchoolId && entry.schoolId !== scopeSchoolId) throw Object.assign(new Error('cross_school_forbidden'), { status: 403 })
  await prisma.outboxEntry.update({ where: { id }, data: { status: 'PENDING', runAfter: new Date(), failedAt: null, lastError: null } })
  return { retried: true }
}

/** Retry ALL failed jobs in scope. */
export async function retryFailedJobs(scopeSchoolId: string | null): Promise<{ retried: number }> {
  const r = await prisma.outboxEntry.updateMany({
    where: { status: 'FAILED', ...(scopeSchoolId ? { schoolId: scopeSchoolId } : {}) },
    data: { status: 'PENDING', runAfter: new Date(), failedAt: null, lastError: null },
  })
  return { retried: r.count }
}

// ── Module 11: incident centre (derived, no store) ────────────────────────────
export interface Incident {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  affected: string
  suggestedAction: string
  runbook: string
}

export async function getIncidents(scopeSchoolId: string | null): Promise<Incident[]> {
  const [status, metrics] = await Promise.all([getSystemStatus(), getBetaMetrics(scopeSchoolId)])
  const incidents: Incident[] = []

  const db = status.components.find((c) => c.component === 'Database')
  if (db && db.state === 'down') {
    incidents.push({ id: 'db-down', severity: 'critical', title: 'Database unavailable', affected: 'all schools', suggestedAction: 'Check DB provider / failover', runbook: 'OPERATIONS.md#6-database-outage' })
  }
  const email = status.components.find((c) => c.component === 'Email (Resend)')
  if (email && email.state === 'not_configured') {
    incidents.push({ id: 'email-off', severity: 'warning', title: 'Email provider not configured', affected: 'invites + codes', suggestedAction: 'Set RESEND_API_KEY', runbook: 'OPERATIONS.md#8-email-outage' })
  }
  if (metrics.queue.failedJobs > 0) {
    incidents.push({ id: 'queue-failed', severity: 'warning', title: `${metrics.queue.failedJobs} failed background jobs`, affected: 'notifications/email', suggestedAction: 'Inspect + retry in Background Jobs', runbook: 'OPERATIONS.md#5-queue-backlog' })
  }
  if (metrics.queue.oldestPendingAgeSec !== null && metrics.queue.oldestPendingAgeSec > 600) {
    incidents.push({ id: 'queue-stalled', severity: 'warning', title: 'Queue not draining (worker may be stalled)', affected: 'notifications/email', suggestedAction: 'Restart the worker', runbook: 'OPERATIONS.md#5-queue-backlog' })
  }
  if (metrics.auth.lockouts24h >= 5) {
    incidents.push({ id: 'auth-lockouts', severity: 'info', title: `${metrics.auth.lockouts24h} code lockouts in 24h`, affected: 'sign-in', suggestedAction: 'Check for a delivery issue or abuse', runbook: 'OPERATIONS.md#1-parent-cant-log-in' })
  }
  return incidents
}

// ── Module 14: release info ───────────────────────────────────────────────────
export async function getReleaseInfo() {
  let migration: string | null = null
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1
    `
    migration = rows[0]?.migration_name ?? null
  } catch {
    migration = null
  }
  return {
    version: process.env.npm_package_version || null,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RELEASE || null,
    environment: process.env.NODE_ENV || 'development',
    migration,
    sentryConfigured: !!process.env.SENTRY_DSN,
    startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
  }
}
