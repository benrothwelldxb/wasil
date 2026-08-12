import type { Request } from 'express'
import prisma from './prisma.js'

/**
 * Authentication audit trail.
 *
 * A dedicated, security-investigation log — deliberately separate from the
 * business `AuditLog` (services/audit.ts), which requires an authenticated
 * `req.user`, a non-null `schoolId` and an enum action, and so cannot record
 * the events that matter most for auth forensics: a login *requested* for an
 * unknown email, a *failed* verification, a lockout. Those all happen with no
 * authenticated principal.
 *
 * Design rules:
 *  - Writes are best-effort and NEVER throw — an audit failure must not break
 *    or slow the auth path (they're also `void`-returning so callers don't await
 *    a slow log on the hot path unless they choose to).
 *  - NEVER pass a code, a code hash, a token or a password in `metadata`. The
 *    subject email is stored (it's the thing an investigator searches by); the
 *    secret never is.
 *  - No foreign keys on the row, so it survives a user deletion and can't fail
 *    on a race with one.
 */

export const AUTH_EVENT = {
  LOGIN_REQUESTED: 'login_requested', // /code/request received (before we know if the email is real)
  CODE_ISSUED: 'code_issued', // a fresh code was minted + emailed (real account only)
  CODE_RESENT: 'code_resent', // a code was issued while a prior un-consumed one existed (superseded)
  CODE_REQUEST_UNKNOWN: 'code_request_unknown', // request for an email with no account (no code minted)
  VERIFY_ATTEMPTED: 'verify_attempted', // /code/verify received
  VERIFY_SUCCEEDED: 'verify_succeeded', // correct code, single-use burn won
  VERIFY_FAILED: 'verify_failed', // wrong code (attempt counted)
  LOCKOUT_TRIGGERED: 'lockout_triggered', // code hit the max-attempt ceiling and was killed
  LOCKOUT_ACTIVE: 'lockout_active', // verify hit an already-locked/exhausted code
  LOCKOUT_EXPIRED: 'lockout_expired', // a previously locked/expired code is no longer live (swept/superseded)
  SESSION_CREATED: 'session_created', // access + refresh pair issued
  TWO_FACTOR_REQUIRED: 'two_factor_required', // correct code but 2FA handoff returned instead of a session
  LOGOUT: 'logout', // refresh token revoked
  IMPERSONATION_STARTED: 'impersonation_started', // an admin began impersonating a user
  IMPERSONATION_ENDED: 'impersonation_ended', // impersonation session explicitly ended
} as const

export type AuthEventName = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT]

/** A code-adjacent value must never reach the log. This is a belt-and-braces
 * filter over metadata keys in case a caller is careless. */
const FORBIDDEN_METADATA_KEYS = new Set([
  'code', 'codeHash', 'hash', 'password', 'passwordHash', 'token',
  'accessToken', 'refreshToken', 'secret', 'twoFactorSecret',
])

function scrubMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(k)) continue
    clean[k] = v
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

function clientIp(req?: Request): string | null {
  if (!req) return null
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? null
}

function userAgent(req?: Request): string | null {
  if (!req) return null
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua.slice(0, 512) : null
}

export interface LogAuthEventParams {
  event: AuthEventName
  req?: Request
  email?: string | null
  userId?: string | null
  schoolId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append an auth event. Fire-and-forget: returns a promise (so tests/cleanup
 * can await it) but callers on the request path may simply not await it — it
 * catches its own errors and never rejects.
 */
export async function logAuthEvent({
  event,
  req,
  email,
  userId,
  schoolId,
  metadata,
}: LogAuthEventParams): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        event,
        email: email ? email.toLowerCase() : null,
        userId: userId ?? null,
        schoolId: schoolId ?? null,
        ipAddress: clientIp(req),
        userAgent: userAgent(req),
        metadata: scrubMetadata(metadata) as object | undefined,
      },
    })
  } catch (error) {
    // Auditing must never break auth. Log to stderr and move on.
    console.error('[authAudit] failed to record', event, error)
  }
}
