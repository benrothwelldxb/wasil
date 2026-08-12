import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin, isAuthenticated } from '../middleware/auth.js'
import { getBetaMetrics } from '../services/opsMetrics.js'
import { getSystemStatus } from '../services/systemStatus.js'
import {
  listFlags, setGlobalDefault, setOverride, clearOverride, resolveAll,
} from '../services/featureFlags.js'
import { startImpersonation, stopImpersonation, ImpersonationError } from '../services/impersonation.js'
import { logAudit } from '../services/audit.js'

/**
 * Beta operations & support API.
 *
 *  - `opsRouter`      (mounted at /api/ops) — admin/super-admin tooling:
 *    metrics, status, support search, feature flags, announcements, feedback
 *    triage, impersonation. Tenant-scoped: a plain ADMIN only ever sees their
 *    own school; a SUPER_ADMIN sees the platform (and may pass ?schoolId=).
 *  - `clientOpsRouter` (mounted at /api) — the three endpoints any signed-in
 *    user needs: submit feedback, read active announcements, bootstrap flags.
 */

const opsRouter = Router()
const clientOpsRouter = Router()

// Resolve the school an ops read/write is scoped to. Non-super-admins are
// pinned to their own school (tenant isolation); super-admins may target one
// via ?schoolId= or see the whole platform.
function scopeSchool(req: Request): string | null {
  if (req.user?.role === 'SUPER_ADMIN') return (req.query.schoolId as string) || null
  return req.user?.schoolId ?? null
}
function isSuper(req: Request): boolean {
  return req.user?.role === 'SUPER_ADMIN'
}

// ── Part 1 & 9: metrics ──────────────────────────────────────────────────────
opsRouter.get('/metrics', isAdmin, async (req: Request, res: Response) => {
  try {
    res.json(await getBetaMetrics(scopeSchool(req)))
  } catch (e) {
    console.error('[ops] metrics error', e)
    res.status(500).json({ error: 'Failed to load metrics' })
  }
})

// ── Part 5: system status ────────────────────────────────────────────────────
opsRouter.get('/status', isAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await getSystemStatus())
  } catch (e) {
    console.error('[ops] status error', e)
    res.status(500).json({ error: 'Failed to load status' })
  }
})

// ── Part 2: support search (never needs SQL) ─────────────────────────────────
opsRouter.get('/support/search', isAdmin, async (req: Request, res: Response) => {
  const q = ((req.query.q as string) || '').trim()
  if (q.length < 2) return res.json({ results: [] })
  const school = scopeSchool(req)
  const schoolFilter = school ? { schoolId: school } : {}

  try {
    // Match parents by name/email, and children/students by name → their parents.
    const [byUser, byStudent] = await Promise.all([
      prisma.user.findMany({
        where: {
          ...schoolFilter, role: 'PARENT',
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true, schoolId: true, welcomeSentAt: true, lastLoginAt: true },
        take: 20,
      }),
      prisma.student.findMany({
        where: {
          ...schoolFilter,
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, firstName: true, lastName: true,
          parentLinks: { select: { user: { select: { id: true, name: true, email: true, schoolId: true, welcomeSentAt: true, lastLoginAt: true } } } },
        },
        take: 20,
      }),
    ])

    const map = new Map<string, { id: string; name: string; email: string; schoolId: string; invited: boolean; activated: boolean; matchedVia: string }>()
    for (const u of byUser) {
      map.set(u.id, { id: u.id, name: u.name, email: u.email, schoolId: u.schoolId, invited: !!u.welcomeSentAt, activated: !!u.lastLoginAt, matchedVia: 'parent' })
    }
    for (const s of byStudent) {
      for (const link of s.parentLinks) {
        const u = link.user
        if (!u || map.has(u.id)) continue
        map.set(u.id, { id: u.id, name: u.name, email: u.email, schoolId: u.schoolId, invited: !!u.welcomeSentAt, activated: !!u.lastLoginAt, matchedVia: `child: ${s.firstName} ${s.lastName}` })
      }
    }
    res.json({ results: Array.from(map.values()) })
  } catch (e) {
    console.error('[ops] support search error', e)
    res.status(500).json({ error: 'Search failed' })
  }
})

// Support: full parent detail — invitation, activation, activity, notifications,
// bookings, audit — all in one call so support never touches the database.
opsRouter.get('/support/parent/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, role: true, schoolId: true,
        welcomeSentAt: true, lastLoginAt: true, createdAt: true,
        twoFactorEnabled: true, failedLoginAttempts: true, lockedUntil: true,
        studentLinks: { select: { student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } } } },
      },
    })
    if (!user) return res.status(404).json({ error: 'Parent not found' })
    // Tenant guard.
    if (!isSuper(req) && user.schoolId !== req.user!.schoolId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const [authEvents, auditLogs, notifications, clubBookings, consultations] = await Promise.all([
      prisma.authEvent.findMany({
        where: { OR: [{ userId: user.id }, { email: user.email.toLowerCase() }] },
        orderBy: { createdAt: 'desc' }, take: 25,
        select: { event: true, ipAddress: true, createdAt: true, metadata: true },
      }),
      prisma.auditLog.findMany({
        where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 25,
        select: { action: true, resourceType: true, resourceId: true, createdAt: true },
      }),
      prisma.notification.findMany({
        where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 25,
        select: { type: true, title: true, read: true, createdAt: true },
      }),
      prisma.ecaProviderBooking.findMany({
        where: { parentUserId: user.id }, orderBy: { createdAt: 'desc' }, take: 25,
        select: { id: true, paymentStatus: true, cancelledAt: true, createdAt: true, student: { select: { firstName: true, lastName: true } } },
      }).catch(() => []),
      prisma.consultationBooking.findMany({
        where: { parentId: user.id }, orderBy: { createdAt: 'desc' }, take: 25,
        select: { id: true, createdAt: true },
      }).catch(() => []),
    ])

    res.json({
      parent: {
        id: user.id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId,
        invited: !!user.welcomeSentAt, invitedAt: user.welcomeSentAt,
        activated: !!user.lastLoginAt, lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
        locked: !!(user.lockedUntil && user.lockedUntil > new Date()),
        lockedUntil: user.lockedUntil,
        failedLoginAttempts: user.failedLoginAttempts,
        children: user.studentLinks.map((l) => ({ name: `${l.student.firstName} ${l.student.lastName}`, className: l.student.class?.name ?? null })),
      },
      authEvents, auditLogs, notifications,
      bookings: { clubs: clubBookings, consultations },
    })
  } catch (e) {
    console.error('[ops] parent detail error', e)
    res.status(500).json({ error: 'Failed to load parent' })
  }
})

// ── Part 4: feature flags ────────────────────────────────────────────────────
opsRouter.get('/flags', isAdmin, async (_req: Request, res: Response) => {
  res.json({ flags: await listFlags() })
})

opsRouter.post('/flags/:key/global', isAdmin, async (req: Request, res: Response) => {
  if (!isSuper(req)) return res.status(403).json({ error: 'Global flag changes require super-admin' })
  const { enabled } = req.body as { enabled?: boolean }
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' })
  const flag = await setGlobalDefault(req.params.key, enabled, req.user!.id)
  logAudit({ req, action: 'UPDATE', resourceType: 'SCHOOL', resourceId: `flag:${req.params.key}`, metadata: { scope: 'global', enabled } })
  res.json({ flag })
})

opsRouter.post('/flags/:key/override', isAdmin, async (req: Request, res: Response) => {
  const { schoolId, userId, enabled } = req.body as { schoolId?: string; userId?: string; enabled?: boolean }
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) required' })
  // A plain admin may only pin their OWN school; super-admin may target anyone.
  const targetSchool = isSuper(req) ? schoolId : req.user!.schoolId
  if (!isSuper(req) && (userId || (schoolId && schoolId !== req.user!.schoolId))) {
    return res.status(403).json({ error: 'Admins may only override their own school' })
  }
  try {
    const override = await setOverride(req.params.key, { schoolId: userId ? undefined : targetSchool, userId }, enabled, req.user!.id)
    logAudit({ req, action: 'UPDATE', resourceType: 'SCHOOL', resourceId: `flag:${req.params.key}`, metadata: { scope: userId ? 'user' : 'school', targetSchool, userId, enabled } })
    res.json({ override })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

opsRouter.delete('/flags/:key/override', isAdmin, async (req: Request, res: Response) => {
  const { schoolId, userId } = req.body as { schoolId?: string; userId?: string }
  const targetSchool = isSuper(req) ? schoolId : req.user!.schoolId
  if (!isSuper(req) && (userId || (schoolId && schoolId !== req.user!.schoolId))) {
    return res.status(403).json({ error: 'Admins may only override their own school' })
  }
  const r = await clearOverride(req.params.key, { schoolId: userId ? undefined : targetSchool, userId })
  res.json({ cleared: r.count })
})

// ── Part 8: announcements (admin CRUD) ───────────────────────────────────────
opsRouter.get('/announcements', isAdmin, async (req: Request, res: Response) => {
  const school = scopeSchool(req)
  const announcements = await prisma.announcement.findMany({
    where: school ? { OR: [{ schoolId: school }, { schoolId: null }] } : {},
    orderBy: { createdAt: 'desc' }, take: 100,
  })
  res.json({ announcements })
})

opsRouter.post('/announcements', isAdmin, async (req: Request, res: Response) => {
  const { title, body, kind, level, schoolId, startsAt, endsAt, active } = req.body as Record<string, unknown>
  if (typeof title !== 'string' || title.trim().length < 2) return res.status(400).json({ error: 'title required' })
  // Only super-admins publish platform-wide (schoolId null) or to another school.
  const targetSchool = isSuper(req) ? (schoolId as string | undefined) ?? null : req.user!.schoolId
  const ann = await prisma.announcement.create({
    data: {
      title: title.trim(),
      body: typeof body === 'string' ? body : null,
      kind: typeof kind === 'string' ? kind : 'info',
      level: typeof level === 'string' ? level : 'info',
      schoolId: targetSchool,
      startsAt: startsAt ? new Date(startsAt as string) : new Date(),
      endsAt: endsAt ? new Date(endsAt as string) : null,
      active: active === undefined ? true : !!active,
      createdBy: req.user!.id,
    },
  })
  logAudit({ req, action: 'CREATE', resourceType: 'SCHOOL', resourceId: `announcement:${ann.id}`, metadata: { kind: ann.kind, level: ann.level } })
  res.status(201).json({ announcement: ann })
})

opsRouter.patch('/announcements/:id', isAdmin, async (req: Request, res: Response) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (!isSuper(req) && existing.schoolId !== req.user!.schoolId) return res.status(403).json({ error: 'Forbidden' })
  const { title, body, kind, level, active, startsAt, endsAt } = req.body as Record<string, unknown>
  const ann = await prisma.announcement.update({
    where: { id: req.params.id },
    data: {
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof body === 'string' ? { body } : {}),
      ...(typeof kind === 'string' ? { kind } : {}),
      ...(typeof level === 'string' ? { level } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
      ...(startsAt ? { startsAt: new Date(startsAt as string) } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt as string) : null } : {}),
    },
  })
  res.json({ announcement: ann })
})

opsRouter.delete('/announcements/:id', isAdmin, async (req: Request, res: Response) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  if (!isSuper(req) && existing.schoolId !== req.user!.schoolId) return res.status(403).json({ error: 'Forbidden' })
  await prisma.announcement.delete({ where: { id: req.params.id } })
  res.json({ deleted: true })
})

// ── Part 6: feedback triage ──────────────────────────────────────────────────
opsRouter.get('/feedback', isAdmin, async (req: Request, res: Response) => {
  const school = scopeSchool(req)
  const status = req.query.status as string | undefined
  const feedback = await prisma.feedback.findMany({
    where: { ...(school ? { schoolId: school } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100,
  })
  res.json({ feedback })
})

opsRouter.patch('/feedback/:id', isAdmin, async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string }
  if (!status || !['open', 'triaged', 'closed'].includes(status)) return res.status(400).json({ error: 'status must be open|triaged|closed' })
  const fb = await prisma.feedback.update({ where: { id: req.params.id }, data: { status } })
  res.json({ feedback: fb })
})

// ── Part 3: impersonation ────────────────────────────────────────────────────
opsRouter.post('/impersonate/:userId', isAdmin, async (req: Request, res: Response) => {
  try {
    const result = await startImpersonation({
      adminId: req.user!.id,
      adminSchoolId: req.user!.schoolId,
      adminIsSuperAdmin: isSuper(req),
      targetUserId: req.params.userId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      req,
    })
    logAudit({ req, action: 'UPDATE', resourceType: 'USER', resourceId: result.target.id, metadata: { action: 'impersonate', sessionId: result.sessionId } })
    res.json({
      token: result.token,
      expiresAt: result.expiresAt,
      sessionId: result.sessionId,
      target: { id: result.target.id, name: result.target.name, email: result.target.email },
      note: 'Send this token as the Bearer token to act as the user. It expires and has no refresh; discard it to exit.',
    })
  } catch (e) {
    if (e instanceof ImpersonationError) return res.status(e.status).json({ error: e.message })
    console.error('[ops] impersonate error', e)
    res.status(500).json({ error: 'Impersonation failed' })
  }
})

opsRouter.post('/impersonate/stop', isAdmin, async (req: Request, res: Response) => {
  const r = await stopImpersonation({ adminId: req.user!.id, sessionId: req.body?.sessionId, req })
  res.json(r)
})

// ── Client-facing (any signed-in user) ───────────────────────────────────────

// Part 6: submit feedback with client context attached.
clientOpsRouter.post('/feedback', isAuthenticated, async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (message.length < 3) return res.status(400).json({ error: 'message required' })
  const truncate = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)
  const fb = await prisma.feedback.create({
    data: {
      userId: req.user!.id,
      schoolId: req.user!.schoolId,
      message: message.slice(0, 5000),
      screen: truncate(b.screen, 200),
      url: truncate(b.url, 500),
      appVersion: truncate(b.appVersion, 50),
      userAgent: truncate(req.headers['user-agent'], 512),
      consoleLogs: truncate(b.consoleLogs, 10000),
      screenshotUrl: truncate(b.screenshotUrl, 1000),
      metadata: (b.metadata && typeof b.metadata === 'object' ? b.metadata : undefined) as object | undefined,
    },
  })
  res.status(201).json({ id: fb.id, ok: true })
})

// Part 8: active announcements for the caller's school.
clientOpsRouter.get('/announcements', isAuthenticated, async (req: Request, res: Response) => {
  const now = new Date()
  const announcements = await prisma.announcement.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      AND: [{ OR: [{ schoolId: null }, { schoolId: req.user!.schoolId }] }],
    },
    orderBy: [{ level: 'desc' }, { startsAt: 'desc' }],
    select: { id: true, kind: true, level: true, title: true, body: true, startsAt: true, endsAt: true },
  })
  res.json({ announcements })
})

// Part 4: feature flag bootstrap for the caller.
clientOpsRouter.get('/feature-flags', isAuthenticated, async (req: Request, res: Response) => {
  res.json({ flags: await resolveAll({ userId: req.user!.id, schoolId: req.user!.schoolId }) })
})

export { clientOpsRouter }
export default opsRouter
