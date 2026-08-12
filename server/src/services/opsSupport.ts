import crypto from 'crypto'
import type { Request } from 'express'
import prisma from './prisma.js'
import { sendParentWelcomeEmail } from './email.js'
import { logAuthEvent, AUTH_EVENT } from './authAudit.js'

/**
 * Operator support actions on a parent account.
 *
 * Every action here is:
 *  - permission-checked  — routes gate with isAdmin; these helpers additionally
 *    enforce TENANT ISOLATION (a plain admin may only touch a parent in their own
 *    school; only a super-admin crosses schools) via `loadTargetInScope`.
 *  - audited             — each writes an `AuthEvent` (so it shows up on the
 *    parent's authentication history) tagged with the acting admin; the route
 *    additionally writes the business `AuditLog`.
 *  - safe                — actions never expose a secret to the operator except
 *    the deliberate `generateSupportMagicLink` (a one-time, short-lived login
 *    link the operator hands to the parent), which is itself audited.
 */

const MAGIC_LINK_EXPIRY_MINUTES = 15
const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'

export class OpsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'OpsError'
    this.status = status
  }
}

export interface Actor {
  id: string
  schoolId: string
  isSuperAdmin: boolean
}

interface TargetParent {
  id: string
  email: string
  name: string
  schoolId: string
  role: string
}

/** Load the target parent and enforce tenant isolation. */
export async function loadTargetInScope(actor: Actor, userId: string): Promise<TargetParent> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, schoolId: true, role: true, school: { select: { name: true } } },
  })
  if (!user) throw new OpsError('parent_not_found', 404)
  if (!actor.isSuperAdmin && user.schoolId !== actor.schoolId) throw new OpsError('cross_school_forbidden', 403)
  return { id: user.id, email: user.email, name: user.name, schoolId: user.schoolId, role: user.role }
}

export async function resendInvite(actor: Actor, userId: string, req?: Request): Promise<{ sent: boolean }> {
  const target = await loadTargetInScope(actor, userId)
  const school = await prisma.school.findUnique({ where: { id: target.schoolId }, select: { name: true } })
  await sendParentWelcomeEmail({ to: target.email, schoolName: school?.name || 'School' })
  await prisma.user.update({ where: { id: target.id }, data: { welcomeSentAt: new Date() } })
  void logAuthEvent({ event: AUTH_EVENT.SUPPORT_INVITE_RESENT, req, userId: target.id, schoolId: target.schoolId, email: target.email, metadata: { adminId: actor.id } })
  return { sent: true }
}

export async function unlockAccount(actor: Actor, userId: string, req?: Request): Promise<{ unlocked: boolean }> {
  const target = await loadTargetInScope(actor, userId)
  await prisma.user.update({ where: { id: target.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
  void logAuthEvent({ event: AUTH_EVENT.SUPPORT_ACCOUNT_UNLOCKED, req, userId: target.id, schoolId: target.schoolId, email: target.email, metadata: { adminId: actor.id } })
  return { unlocked: true }
}

export async function invalidateSessions(actor: Actor, userId: string, req?: Request): Promise<{ revoked: number }> {
  const target = await loadTargetInScope(actor, userId)
  const r = await prisma.refreshToken.deleteMany({ where: { userId: target.id } })
  void logAuthEvent({ event: AUTH_EVENT.SUPPORT_SESSIONS_INVALIDATED, req, userId: target.id, schoolId: target.schoolId, email: target.email, metadata: { adminId: actor.id, revoked: r.count } })
  return { revoked: r.count }
}

/**
 * Reset onboarding: mark the parent un-invited (clear `welcomeSentAt`) so a fresh
 * invite / first-run can be issued. Deliberately does NOT delete the account,
 * children, bookings or history — it only resets the invitation state.
 */
export async function resetOnboarding(actor: Actor, userId: string, req?: Request): Promise<{ reset: boolean }> {
  const target = await loadTargetInScope(actor, userId)
  await prisma.user.update({ where: { id: target.id }, data: { welcomeSentAt: null } })
  void logAuthEvent({ event: AUTH_EVENT.SUPPORT_ONBOARDING_RESET, req, userId: target.id, schoolId: target.schoolId, email: target.email, metadata: { adminId: actor.id } })
  return { reset: true }
}

/**
 * Mint a one-time, short-lived magic login link for the parent that the operator
 * can hand over (e.g. a parent who cannot receive email). Reuses the existing
 * MagicLinkToken/`/auth/magic` infrastructure; supersedes any prior LOGIN token.
 */
export async function generateSupportMagicLink(actor: Actor, userId: string, req?: Request): Promise<{ url: string; expiresAt: Date }> {
  const target = await loadTargetInScope(actor, userId)
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000)
  await prisma.magicLinkToken.deleteMany({ where: { email: target.email.toLowerCase(), type: 'LOGIN' } })
  await prisma.magicLinkToken.create({
    data: { token, email: target.email.toLowerCase(), schoolId: target.schoolId, type: 'LOGIN', expiresAt },
  })
  void logAuthEvent({ event: AUTH_EVENT.SUPPORT_MAGIC_LINK_ISSUED, req, userId: target.id, schoolId: target.schoolId, email: target.email, metadata: { adminId: actor.id, expiresAt } })
  // The link is a credential — it is returned to the operator over the authed
  // ops channel only, and never logged (the AuthEvent records issuance, not the token).
  return { url: `${PARENT_APP_URL}/auth/magic?token=${token}`, expiresAt }
}
