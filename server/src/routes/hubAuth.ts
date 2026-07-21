// Wasil Hub SSO exchange endpoint.
//
// Flow: a staff member clicks "Connect" on Hub → Hub mints a 5-minute RS256
// JWT and redirects the browser here with `?hub_token=<JWT>`. We verify the
// token against Hub's JWKS, enforce single-use, resolve it to a pre-existing
// Connect staff account, mint Connect's own session tokens, and hand them to
// the admin app via the existing auth-code redirect (`/auth/callback?code=`).
//
// Hub owns MFA, so this path deliberately bypasses Connect's own 2FA session
// step — a verified Hub token is sufficient proof of identity.
//
// On any failure we redirect to the admin app's /login with a safe, non-leaky
// `error` reason: invalid_token | school_not_linked | no_account | replayed.
import { Router, Request, Response } from 'express'
import { generateAccessToken, generateRefreshToken } from '../services/jwt.js'
import { generateAuthCode } from './auth.js'
import {
  verifyHubToken,
  consumeHubToken,
  HubTokenError,
  HubTokenReplayError,
} from '../services/hubSso.js'
import {
  resolveHubStaffUser,
  SchoolNotLinkedError,
  NoConnectAccountError,
} from '../services/hubProvisioning.js'

const router = Router()

const ADMIN_APP_URL = process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:3001'

type FailReason = 'invalid_token' | 'school_not_linked' | 'no_account' | 'replayed'

async function handleExchange(req: Request, res: Response) {
  const fail = (reason: FailReason) =>
    res.redirect(`${ADMIN_APP_URL}/login?error=${reason}`)

  // Accept the token from the query (GET redirect) or the body (POST).
  const raw = (req.method === 'POST' ? req.body?.hub_token : req.query.hub_token) as unknown
  const token = typeof raw === 'string' ? raw : ''
  if (!token) return fail('invalid_token')

  // 1. Verify signature / issuer / audience / expiry against Hub's JWKS.
  let claims
  try {
    claims = await verifyHubToken(token)
  } catch (err) {
    if (err instanceof HubTokenError) return fail('invalid_token')
    throw err
  }

  // 2. Enforce single-use before doing any work, so a captured token can't be
  //    replayed within its lifetime even if the first exchange failed later.
  try {
    consumeHubToken(claims.jti, claims.expiresAt)
  } catch (err) {
    if (err instanceof HubTokenReplayError) return fail('replayed')
    throw err
  }

  // 3. Resolve to a pre-existing Connect staff account (link-to-existing-only).
  let user
  try {
    user = await resolveHubStaffUser(claims)
  } catch (err) {
    if (err instanceof SchoolNotLinkedError) return fail('school_not_linked')
    if (err instanceof NoConnectAccountError) return fail('no_account')
    throw err
  }

  // 4. Issue Connect's own session tokens (Hub owns MFA — bypass Connect 2FA)
  //    and hand off via the existing auth-code redirect the admin app consumes.
  const accessToken = generateAccessToken(user)
  const refreshToken = await generateRefreshToken(user)
  const code = generateAuthCode(accessToken, refreshToken)
  return res.redirect(`${ADMIN_APP_URL}/auth/callback?code=${encodeURIComponent(code)}`)
}

router.get('/exchange', handleExchange)
router.post('/exchange', handleExchange)

export default router
