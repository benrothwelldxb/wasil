import crypto from 'crypto'

/**
 * Signed, single-use, short-lived OAuth state tokens.
 *
 * Google's OAuth flow round-trips a `state` parameter. We use it to bind the
 * outgoing flow to a specific authenticated admin + school, and verify both
 * the binding and freshness on the callback. The callback itself runs without
 * a session (Google redirects the user's browser back without our cookies),
 * so this signed state is the only proof of intent we have.
 */

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

interface StatePayload {
  schoolId: string
  userId: string
  /** Random nonce to make each token unique and prevent replay. */
  nonce: string
  /** Unix ms expiry. */
  exp: number
}

// In-memory single-use store. For multi-instance deploys this should move
// to Redis, but the simple Map is fine for a single Node process. Entries
// are evicted lazily on miss or when they expire.
const usedNonces = new Map<string, number>()

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required to sign OAuth state')
  return secret
}

function sign(payloadJson: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadJson).digest('base64url')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Issue a signed state token binding this OAuth flow to a specific admin user
 * and their school. The opaque token returned is what gets passed as `state`
 * in the OAuth URL.
 */
export function issueOAuthState(schoolId: string, userId: string): string {
  const payload: StatePayload = {
    schoolId,
    userId,
    nonce: crypto.randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = Buffer.from(payloadJson).toString('base64url')
  const sig = sign(payloadJson)
  return `${payloadB64}.${sig}`
}

/**
 * Verify a state token. Returns the bound {schoolId, userId} on success.
 * Throws if the signature is invalid, the token is expired, or the nonce
 * has already been consumed.
 */
export function consumeOAuthState(token: string): { schoolId: string; userId: string } {
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('Invalid state format')
  const [payloadB64, sig] = parts

  let payloadJson: string
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8')
  } catch {
    throw new Error('Invalid state encoding')
  }

  const expectedSig = sign(payloadJson)
  if (!timingSafeEqual(sig, expectedSig)) {
    throw new Error('Invalid state signature')
  }

  let payload: StatePayload
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    throw new Error('Invalid state payload')
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    throw new Error('State expired')
  }
  if (!payload.schoolId || !payload.userId || !payload.nonce) {
    throw new Error('Incomplete state payload')
  }

  // Single-use: reject if we've seen this nonce before
  pruneExpiredNonces()
  if (usedNonces.has(payload.nonce)) {
    throw new Error('State already used')
  }
  usedNonces.set(payload.nonce, payload.exp)

  return { schoolId: payload.schoolId, userId: payload.userId }
}

function pruneExpiredNonces() {
  const now = Date.now()
  for (const [nonce, exp] of usedNonces) {
    if (exp < now) usedNonces.delete(nonce)
  }
}
