import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from './prisma.js'

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable must be set')
if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET environment variable must be set')
const JWT_SECRET: string = process.env.JWT_SECRET
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY_DAYS = 30

interface AccessTokenPayload {
  userId: string
  role: string
  schoolId: string
}

export function generateAccessToken(user: { id: string; role: string; schoolId: string }): string {
  return jwt.sign(
    { userId: user.id, role: user.role, schoolId: user.schoolId } satisfies AccessTokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )
}

export async function generateRefreshToken(user: { id: string }): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ])

  return token
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload & { kind?: string }
  // A provider-portal token must never authenticate a staff/parent request.
  if (payload.kind === 'provider') throw new Error('Provider token is not valid on this endpoint')
  return payload
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } })
}

export async function rotateRefreshToken(oldToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Atomically claim the old token: find it and delete it inside one
  // transaction, using deleteMany (which reports a count) rather than delete
  // (which throws P2025 on a missing row). Two concurrent refreshes carrying
  // the same token — e.g. two open tabs — serialize on the row lock: exactly
  // one gets count===1 and proceeds; the loser gets count===0 and a clean null
  // instead of an unhandled 500 that hangs the auth path.
  const user = await prisma.$transaction(async (tx) => {
    const stored = await tx.refreshToken.findUnique({
      where: { token: oldToken },
      include: { user: true },
    })
    if (!stored) return null

    const claim = await tx.refreshToken.deleteMany({ where: { id: stored.id } })
    if (claim.count === 0) return null // already rotated by a concurrent request

    if (stored.expiresAt < new Date()) return null // expired (now also cleaned up)
    return stored.user
  })

  if (!user) return null

  // Issue a fresh pair for the winner.
  const accessToken = generateAccessToken(user)
  const refreshToken = await generateRefreshToken(user)

  return { accessToken, refreshToken }
}

// ─── Provider portal tokens ──────────────────────────────────────────────────
// Distinct from staff/parent tokens: they carry `kind: 'provider'` so they are
// rejected on staff/parent endpoints (see verifyAccessToken) and vice versa,
// and they persist to ProviderRefreshToken rather than RefreshToken.

interface ProviderTokenPayload {
  kind: 'provider'
  providerUserId: string
  providerId: string
}

export function generateProviderAccessToken(pu: { id: string; providerId: string }): string {
  return jwt.sign(
    { kind: 'provider', providerUserId: pu.id, providerId: pu.providerId } satisfies ProviderTokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  )
}

export function verifyProviderAccessToken(token: string): ProviderTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as ProviderTokenPayload
  if (payload.kind !== 'provider') throw new Error('Not a provider token')
  return payload
}

export async function generateProviderRefreshToken(pu: { id: string }): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  await prisma.$transaction([
    prisma.providerRefreshToken.create({ data: { token, providerUserId: pu.id, expiresAt } }),
    prisma.providerUser.update({ where: { id: pu.id }, data: { lastLoginAt: new Date() } }),
  ])

  return token
}

export async function revokeProviderRefreshToken(token: string): Promise<void> {
  await prisma.providerRefreshToken.deleteMany({ where: { token } })
}

export async function rotateProviderRefreshToken(
  oldToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Same atomic claim-and-rotate as rotateRefreshToken, for provider tokens.
  const providerUser = await prisma.$transaction(async (tx) => {
    const stored = await tx.providerRefreshToken.findUnique({
      where: { token: oldToken },
      include: { providerUser: true },
    })
    if (!stored) return null

    const claim = await tx.providerRefreshToken.deleteMany({ where: { id: stored.id } })
    if (claim.count === 0) return null

    if (stored.expiresAt < new Date()) return null
    return stored.providerUser
  })

  if (!providerUser) return null

  const accessToken = generateProviderAccessToken(providerUser)
  const refreshToken = await generateProviderRefreshToken(providerUser)

  return { accessToken, refreshToken }
}
