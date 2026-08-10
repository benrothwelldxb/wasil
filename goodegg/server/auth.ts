import { createHash, randomInt } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'goodegg_session'
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const SESSION_TTL = '30d'

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set (>= 16 chars) in production.')
    }
    return new TextEncoder().encode('dev-insecure-secret-change-me')
  }
  return new TextEncoder().encode(s)
}

/** A 6-digit numeric code, e.g. "042731". */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** Deterministic hash of a code, salted by email + server secret. Never store raw codes. */
export function hashCode(email: string, code: string): string {
  const pepper = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me'
  return createHash('sha256').update(`${email.toLowerCase()}:${code}:${pepper}`).digest('hex')
}

export function codeExpiry(now = Date.now()): Date {
  return new Date(now + CODE_TTL_MS)
}

/** Issue a signed session token for a profile id. */
export async function issueSession(profileId: string): Promise<string> {
  return new SignJWT({ sub: profileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret())
}

/** Verify a session token; returns the profile id or null. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
