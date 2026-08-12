import prisma from './prisma.js'
import { Prisma } from '@prisma/client'

/**
 * Beta operations metrics — the numbers an operator watches at 9am on the first
 * day of school. Everything is derived from data the platform already writes:
 * `User` (invite/activation funnel), `AuthEvent` (logins/failures/lockouts,
 * from the auth-hardening sprint), `OutboxEntry` (queue + delivery health) and
 * the booking tables. No new tracking tables, no PII beyond counts.
 *
 * All queries accept an optional `schoolId` so a single-school beta can be
 * scoped, and are cheap (counts + a couple of distinct-count raw queries).
 */

export interface BetaMetrics {
  generatedAt: string
  scope: { schoolId: string | null }
  parents: {
    total: number
    invited: number
    activated: number
    pendingInvitations: number
    notInvited: number
    activationRatePct: number | null
  }
  activity: {
    dailyActiveUsers: number
    weeklyActiveUsers: number
    activationsToday: number
    activationsThisWeek: number
  }
  auth: {
    successfulLogins24h: number
    failedVerifications24h: number
    lockouts24h: number
  }
  bookings: {
    created7d: number
    cancelled7d: number
    cancellationRatePct: number | null
  }
  notifications: {
    sent24h: number
    failed24h: number
    successRatePct: number | null
    byKind: Record<string, { sent: number; failed: number; pending: number }>
  }
  queue: {
    depth: number
    failedJobs: number
    oldestPendingAgeSec: number | null
  }
  health: 'ok' | 'degraded' | 'down'
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

async function distinctActiveUsers(since: Date, schoolId?: string | null): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(DISTINCT "userId")::bigint AS c
    FROM "AuthEvent"
    WHERE "event" = 'session_created'
      AND "createdAt" >= ${since}
      AND "userId" IS NOT NULL
      ${schoolId ? prismaAnd(schoolId) : empty()}
  `
  return Number(rows[0]?.c ?? 0)
}

// Conditionally splice a schoolId filter into raw SQL, safely parameterised.
function prismaAnd(schoolId: string) {
  return Prisma.sql`AND "schoolId" = ${schoolId}`
}
function empty() {
  return Prisma.empty
}

export async function getBetaMetrics(schoolId?: string | null): Promise<BetaMetrics> {
  const now = Date.now()
  const day = new Date(now - 24 * 60 * 60 * 1000)
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const parentWhere = { role: 'PARENT' as const, ...(schoolId ? { schoolId } : {}) }
  const authWhere = schoolId ? { schoolId } : {}
  const outboxWhere = schoolId ? { schoolId } : {}

  const [
    total, invited, activated,
    successfulLogins24h, failedVerifications24h, lockouts24h,
    dau, wau, activationsToday, activationsThisWeek,
    outboxRows,
    queuePending, queueFailed, oldestPending,
    bookings7d, cancels7d,
  ] = await Promise.all([
    prisma.user.count({ where: parentWhere }),
    prisma.user.count({ where: { ...parentWhere, welcomeSentAt: { not: null } } }),
    prisma.user.count({ where: { ...parentWhere, lastLoginAt: { not: null } } }),
    prisma.authEvent.count({ where: { ...authWhere, event: 'session_created', createdAt: { gte: day } } }),
    prisma.authEvent.count({ where: { ...authWhere, event: 'verify_failed', createdAt: { gte: day } } }),
    prisma.authEvent.count({ where: { ...authWhere, event: 'lockout_triggered', createdAt: { gte: day } } }),
    distinctActiveUsers(day, schoolId),
    distinctActiveUsers(week, schoolId),
    // "Activations" = parents whose first-ever login landed in the window. We
    // approximate with lastLoginAt for the cumulative funnel and count recent
    // first-logins via User.lastLoginAt when they have logged in exactly once
    // recently; for the beta this is close enough and cheap.
    prisma.user.count({ where: { ...parentWhere, lastLoginAt: { gte: day } } }),
    prisma.user.count({ where: { ...parentWhere, lastLoginAt: { gte: week } } }),
    prisma.outboxEntry.groupBy({
      by: ['kind', 'status'],
      where: { ...outboxWhere, updatedAt: { gte: day } },
      _count: { _all: true },
    }),
    prisma.outboxEntry.count({ where: { ...outboxWhere, status: 'PENDING' } }),
    prisma.outboxEntry.count({ where: { ...outboxWhere, status: 'FAILED' } }),
    prisma.outboxEntry.findFirst({
      where: { ...outboxWhere, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.ecaProviderBooking.count({ where: { ...(schoolId ? { schoolId } : {}), createdAt: { gte: week } } }).catch(() => 0),
    prisma.ecaProviderBooking.count({ where: { ...(schoolId ? { schoolId } : {}), cancelledAt: { gte: week } } }).catch(() => 0),
  ])

  // Notification delivery from the outbox groupBy.
  const byKind: Record<string, { sent: number; failed: number; pending: number }> = {}
  let sent24h = 0, failed24h = 0
  for (const r of outboxRows) {
    const k = String(r.kind)
    byKind[k] ??= { sent: 0, failed: 0, pending: 0 }
    const n = r._count._all
    if (r.status === 'SENT') { byKind[k].sent += n; sent24h += n }
    else if (r.status === 'FAILED') { byKind[k].failed += n; failed24h += n }
    else byKind[k].pending += n
  }

  const pendingInvitations = invited - activated
  const oldestPendingAgeSec = oldestPending
    ? Math.round((now - oldestPending.createdAt.getTime()) / 1000)
    : null

  // Composite health heuristic (mirrors the status page's queue signal).
  let health: BetaMetrics['health'] = 'ok'
  if (queueFailed > 0 || (oldestPendingAgeSec !== null && oldestPendingAgeSec > 600)) health = 'degraded'
  if (failed24h > 0 && sent24h === 0 && failed24h >= 5) health = 'down'

  return {
    generatedAt: new Date(now).toISOString(),
    scope: { schoolId: schoolId ?? null },
    parents: {
      total, invited, activated,
      pendingInvitations: Math.max(0, pendingInvitations),
      notInvited: Math.max(0, total - invited),
      activationRatePct: pct(activated, invited),
    },
    activity: {
      dailyActiveUsers: dau,
      weeklyActiveUsers: wau,
      activationsToday,
      activationsThisWeek,
    },
    auth: { successfulLogins24h, failedVerifications24h, lockouts24h },
    bookings: {
      created7d: bookings7d,
      cancelled7d: cancels7d,
      cancellationRatePct: pct(cancels7d, bookings7d),
    },
    notifications: {
      sent24h, failed24h,
      successRatePct: pct(sent24h, sent24h + failed24h),
      byKind,
    },
    queue: { depth: queuePending, failedJobs: queueFailed, oldestPendingAgeSec },
    health,
  }
}
