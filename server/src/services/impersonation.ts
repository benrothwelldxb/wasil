import type { Request } from 'express'
import prisma from './prisma.js'
import { generateImpersonationToken } from './jwt.js'
import { logAuthEvent, AUTH_EVENT } from './authAudit.js'

/**
 * Safe administrator impersonation.
 *
 * Guarantees:
 *  - Permission-checked   — callers are gated by `isSuperAdmin` at the route.
 *  - Time-limited         — the minted token is short-lived (default 30 min) and
 *                           NO refresh token is issued, so it cannot be silently
 *                           extended; it simply expires.
 *  - Fully audited        — an `ImpersonationSession` row plus start/stop
 *                           `AuthEvent`s record who impersonated whom, when, and
 *                           why. The token itself carries the admin id (`act`).
 *  - Visibly attributable — the client shows a banner (from `/auth/me`'s
 *                           `impersonatedBy`) and can exit by discarding the
 *                           impersonation token and restoring the admin's own.
 *  - Scoped               — an admin may only impersonate a user in their own
 *                           school (checked here); super-admins across schools.
 */

const DEFAULT_TTL_MINUTES = 30

export interface StartImpersonationResult {
  token: string
  expiresAt: Date
  sessionId: string
  target: { id: string; name: string; email: string; role: string; schoolId: string }
}

export async function startImpersonation(opts: {
  adminId: string
  adminSchoolId: string
  adminIsSuperAdmin: boolean
  targetUserId: string
  reason?: string
  req?: Request
  ttlMinutes?: number
}): Promise<StartImpersonationResult> {
  const target = await prisma.user.findUnique({
    where: { id: opts.targetUserId },
    select: { id: true, name: true, email: true, role: true, schoolId: true },
  })
  if (!target) throw new ImpersonationError('target_not_found', 404)

  // Only super-admins may cross school boundaries; never impersonate another admin.
  if (!opts.adminIsSuperAdmin && target.schoolId !== opts.adminSchoolId) {
    throw new ImpersonationError('cross_school_forbidden', 403)
  }
  if (target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') {
    throw new ImpersonationError('cannot_impersonate_admin', 403)
  }
  if (target.id === opts.adminId) {
    throw new ImpersonationError('cannot_impersonate_self', 400)
  }

  const ttl = opts.ttlMinutes ?? DEFAULT_TTL_MINUTES
  const { token, expiresAt } = generateImpersonationToken(
    { id: target.id, role: target.role, schoolId: target.schoolId },
    opts.adminId,
    ttl,
  )

  const session = await prisma.impersonationSession.create({
    data: {
      adminId: opts.adminId,
      targetUserId: target.id,
      schoolId: target.schoolId,
      reason: opts.reason ?? null,
      expiresAt,
    },
  })

  void logAuthEvent({
    event: AUTH_EVENT.IMPERSONATION_STARTED,
    req: opts.req,
    userId: target.id,
    schoolId: target.schoolId,
    email: target.email,
    metadata: { adminId: opts.adminId, sessionId: session.id, reason: opts.reason, ttlMinutes: ttl },
  })

  return { token, expiresAt, sessionId: session.id, target }
}

/** End impersonation for audit. The token still expires on its own; this marks
 * the explicit exit and records it. Idempotent. */
export async function stopImpersonation(opts: {
  adminId: string
  sessionId?: string
  req?: Request
}): Promise<{ ended: number }> {
  const result = await prisma.impersonationSession.updateMany({
    where: {
      adminId: opts.adminId,
      endedAt: null,
      ...(opts.sessionId ? { id: opts.sessionId } : {}),
    },
    data: { endedAt: new Date() },
  })
  if (result.count > 0) {
    void logAuthEvent({
      event: AUTH_EVENT.IMPERSONATION_ENDED,
      req: opts.req,
      metadata: { adminId: opts.adminId, sessionId: opts.sessionId ?? null, ended: result.count },
    })
  }
  return { ended: result.count }
}

export class ImpersonationError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ImpersonationError'
    this.status = status
  }
}
