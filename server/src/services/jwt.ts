import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from './prisma.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret'

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

  await prisma.refreshToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  })

  return token
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } })
}

export async function rotateRefreshToken(oldToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  })

  if (!stored || stored.expiresAt < new Date()) {
    // If expired or not found, clean up and reject
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } })
    }
    return null
  }

  // Delete old token
  await prisma.refreshToken.delete({ where: { id: stored.id } })

  // Issue new pair
  const accessToken = generateAccessToken(stored.user)
  const refreshToken = await generateRefreshToken(stored.user)

  return { accessToken, refreshToken }
}
