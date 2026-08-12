import type { Request } from 'express'
import { generateAccessToken, generateRefreshToken } from './jwt.js'
import { serializeUser } from './serializers.js'
import { logAuthEvent, AUTH_EVENT } from './authAudit.js'

/**
 * The single, shared "you are now signed in" step.
 *
 * Before this existed, `/auth/login`, `/auth/code/verify`, the 2FA completion
 * and the magic-link callback each hand-rolled the same tail: stamp
 * `lastLoginAt`, mint an access token, mint+persist a refresh token, serialise
 * the user, return the trio. Four copies drift; the audit hook and any future
 * change (token lifetime, device binding, session cap) then has to be made in
 * four places. This centralises it so every successful authentication path —
 * present and future — issues sessions identically and is audited identically.
 *
 * Note `lastLoginAt` is updated inside `generateRefreshToken` (in the same
 * transaction that persists the refresh token), so this function does not
 * update it again — the old routes' separate `user.update({ lastLoginAt })`
 * call was redundant and is dropped here with no behavioural change.
 */

// The fully-included user shape the serializer expects. Kept loose (the
// serializer itself is `any`-typed and tolerant) but names the fields the
// token issuers require so a caller passing a bare user is a type error.
export interface SessionUser {
  id: string
  email: string
  role: string
  schoolId: string
  twoFactorEnabled?: boolean
  [key: string]: unknown
}

export interface IssuedSession {
  user: ReturnType<typeof serializeUser>
  accessToken: string
  refreshToken: string
}

/**
 * Issue an access + refresh token pair for an already-authenticated user and
 * return the standard auth response body. Emits a `session_created` audit
 * event. Callers own the 2FA decision *before* calling this (a 2FA-gated user
 * gets the handoff instead and never reaches here).
 *
 * @param user  the user, fetched with the relations `serializeUser` renders.
 * @param opts.req  the request, for audit IP/user-agent + a `method` tag
 *                  ('password' | 'code' | '2fa' | 'magic-link' | 'demo').
 */
export async function issueSession(
  user: SessionUser,
  opts: { req?: Request; method?: string } = {},
): Promise<IssuedSession> {
  const accessToken = generateAccessToken({ id: user.id, role: user.role, schoolId: user.schoolId })
  const refreshToken = await generateRefreshToken({ id: user.id })

  // Best-effort audit; do not let it block or fail the sign-in.
  void logAuthEvent({
    event: AUTH_EVENT.SESSION_CREATED,
    req: opts.req,
    email: user.email,
    userId: user.id,
    schoolId: user.schoolId,
    metadata: opts.method ? { method: opts.method } : undefined,
  })

  return { user: serializeUser(user), accessToken, refreshToken }
}
