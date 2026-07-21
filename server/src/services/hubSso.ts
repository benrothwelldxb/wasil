// Wasil Hub SSO — verification of the short-lived RS256 handoff JWT that Hub
// mints when a staff member clicks "Connect" on Hub and is redirected to
// Connect with `?hub_token=<JWT>`.
//
// Hub is the identity provider. It signs handoff tokens with RS256 and
// publishes its public keys at `${HUB_URL}/.well-known/jwks.json`. We verify
// the signature, issuer and audience via `jose`, map the claims into a shape
// Connect understands, and enforce single-use so a captured token (from proxy
// logs, browser history, a pasted link) can't be replayed within its 5-minute
// lifetime.
//
// Design notes for testability:
//   - `mapHubClaims` is a pure function (payload -> HubClaims) with no I/O, so
//     the claim mapping can be unit-tested without a live Hub.
//   - The single-use replay guard is a self-contained in-memory store exported
//     as `consumeHubToken`, invoked by the exchange route *after* verification.
//     Keeping it out of `verifyHubToken` means the route can be tested with
//     `verifyHubToken` mocked while the real replay guard still runs.
import crypto from 'crypto'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

// --- Config (env, optional-with-defaults so dev/tests don't break) ----------
const HUB_ISSUER = process.env.HUB_ISSUER || 'https://hub.wasil.app'
const HUB_AUDIENCE = process.env.HUB_AUDIENCE || 'wasil-connect'
const HUB_URL = (process.env.HUB_URL || HUB_ISSUER).replace(/\/$/, '')
const HUB_JWKS_URL = process.env.HUB_JWKS_URL || `${HUB_URL}/.well-known/jwks.json`

// --- Typed errors -----------------------------------------------------------
/** Token failed signature / issuer / audience / expiry verification, or was
 * structurally invalid. Mapped to the `invalid_token` redirect reason. */
export class HubTokenError extends Error {
  constructor(message = 'invalid_token') {
    super(message)
    this.name = 'HubTokenError'
  }
}

/** Token verified but has already been consumed. Mapped to `replayed`. */
export class HubTokenReplayError extends Error {
  constructor(message = 'replayed') {
    super(message)
    this.name = 'HubTokenReplayError'
  }
}

// --- Claims -----------------------------------------------------------------
/** The subset of Hub handoff-token claims Connect relies on. */
export interface HubClaims {
  /** Stable Hub user id (`sub`). */
  userId: string
  /** Unique token id (`jti`), or a hash of the token when Hub omits it.
   * Used to enforce single-use at exchange. */
  jti: string
  email: string
  name?: string
  /** Active Hub school id (`sid`). Null for super-admin-without-school. */
  schoolId: string | null
  /** Hub organisation id (`oid`). */
  organisationId: string | null
  /** Hub global roles (`gr`), e.g. ["SCHOOL_ADMIN"]. */
  globalRoles: string[]
  /** Connect app role keys (`ar`). */
  appRoles: string[]
  /** App slug (`app`) — expected to be "connect". */
  appSlug: string
  /** Expiry as a unix timestamp in seconds (`exp`). */
  expiresAt: number
}

/**
 * Pure mapping from a verified JWT payload to Connect's `HubClaims`. No I/O, no
 * verification — call only on a payload that `jwtVerify` has already accepted.
 * `jtiFallback` is used when the token carries no `jti`.
 */
export function mapHubClaims(payload: JWTPayload, jtiFallback: string): HubClaims {
  const p = payload as Record<string, unknown>
  return {
    userId: String(payload.sub ?? ''),
    jti: payload.jti ? String(payload.jti) : jtiFallback,
    email: String(p.email ?? ''),
    name: typeof p.name === 'string' ? p.name : undefined,
    schoolId: p.sid != null ? String(p.sid) : null,
    organisationId: p.oid != null ? String(p.oid) : null,
    globalRoles: Array.isArray(p.gr) ? (p.gr as unknown[]).map(String) : [],
    appRoles: Array.isArray(p.ar) ? (p.ar as unknown[]).map(String) : [],
    appSlug: String(p.app ?? ''),
    expiresAt: typeof payload.exp === 'number' ? payload.exp : 0,
  }
}

// --- JWKS (lazy + cached) ---------------------------------------------------
// createRemoteJWKSet returns a function that fetches + caches Hub's public keys
// and rotates them automatically. Build it lazily so merely importing this
// module (e.g. in tests that mock verifyHubToken) performs no network setup.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(HUB_JWKS_URL))
  return jwks
}

/**
 * Verify a Hub handoff token and map its claims. Throws `HubTokenError` on any
 * signature / issuer / audience / expiry failure. Does NOT enforce single-use —
 * the caller must invoke `consumeHubToken(claims.jti, ...)` after verification.
 */
export async function verifyHubToken(token: string): Promise<HubClaims> {
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, getJwks(), {
      issuer: HUB_ISSUER,
      audience: HUB_AUDIENCE,
      algorithms: ['RS256'],
    }))
  } catch (err) {
    throw new HubTokenError((err as Error)?.message || 'invalid_token')
  }
  // Fallback jti: a stable hash of the raw token, so single-use still works
  // even if Hub ever mints a token without a `jti`.
  const jtiFallback = crypto.createHash('sha256').update(token).digest('hex')
  return mapHubClaims(payload, jtiFallback)
}

// --- Single-use replay guard ------------------------------------------------
// In-memory store of consumed jti -> expiry epoch ms. Mirrors
// wasilhub/packages/sso-client/src/replay.ts. Per-process only: it protects a
// single running instance within the token's lifetime, not across replicas or
// restarts. For multi-instance deployments this would move to a shared store
// (e.g. Redis `SET jti … NX PX ttl`).
const consumed = new Map<string, number>()

// Bound memory: opportunistically drop expired entries once the map grows.
function sweep(now: number): void {
  if (consumed.size < 512) return
  for (const [k, exp] of consumed) if (exp <= now) consumed.delete(k)
}

/**
 * Record a token's `jti` as consumed, enforcing single-use. Throws
 * `HubTokenReplayError` if this jti was already consumed and is still within
 * its TTL. `expiresAt` is the token's `exp` (unix seconds); the entry is kept
 * until then so replays are rejected for exactly the token's remaining life.
 */
export function consumeHubToken(jti: string, expiresAt: number): void {
  const now = Date.now()
  const existing = consumed.get(jti)
  if (existing !== undefined && existing > now) {
    throw new HubTokenReplayError()
  }
  // TTL floor of 1s guards against a token whose exp is already at/behind now
  // (verification would have rejected an expired token, but be defensive).
  const ttlMs = Math.max(expiresAt * 1000 - now, 1000)
  sweep(now)
  consumed.set(jti, now + ttlMs)
}

/** Test-only: clear the replay store between cases. */
export function __resetReplayStore(): void {
  consumed.clear()
}
