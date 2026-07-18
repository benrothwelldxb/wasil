import { Router } from 'express'
import bcrypt from 'bcrypt'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import prisma from '../services/prisma.js'
import { validate } from '../middleware/validate.js'
import { requireProvider } from '../middleware/auth.js'
import {
  generateProviderAccessToken,
  generateProviderRefreshToken,
  revokeProviderRefreshToken,
  rotateProviderRefreshToken,
} from '../services/jwt.js'

const router = Router()

const SALT_ROUNDS = 12
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 30 * 60 * 1000
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const PASSWORD_ERROR = 'Password must be at least 8 characters and include upper, lower, and a number'

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })
const loginPerEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `provider-login:${(req.body?.email || '').toLowerCase()}`,
})
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
const registerSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).regex(PASSWORD_REGEX, PASSWORD_ERROR),
  name: z.string().min(1).optional(),
})
const refreshSchema = z.object({ refreshToken: z.string().min(1) })

function serializeProviderUser(pu: {
  id: string
  email: string
  name: string
  providerId: string
  provider?: { id: string; name: string; type: string; status: string; logoUrl: string | null } | null
}) {
  return {
    id: pu.id,
    email: pu.email,
    name: pu.name,
    providerId: pu.providerId,
    provider: pu.provider
      ? { id: pu.provider.id, name: pu.provider.name, type: pu.provider.type, status: pu.provider.status, logoUrl: pu.provider.logoUrl }
      : undefined,
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, loginPerEmailLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body
  try {
    const providerUser = await prisma.providerUser.findUnique({
      where: { email: email.toLowerCase() },
      include: { provider: true },
    })

    // Generic error either way — never reveal whether the account exists.
    if (!providerUser) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    if (providerUser.lockedUntil && providerUser.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((providerUser.lockedUntil.getTime() - Date.now()) / 60000)
      return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minutes.` })
    }

    if (providerUser.provider.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Provider account is suspended' })
    }

    if (!providerUser.passwordHash) {
      return res.status(401).json({ error: 'Password login not enabled — complete your invitation first' })
    }

    const isValid = await bcrypt.compare(password, providerUser.passwordHash)
    if (!isValid) {
      const newAttempts = providerUser.failedLoginAttempts + 1
      await prisma.providerUser.update({
        where: { id: providerUser.id },
        data: {
          failedLoginAttempts: newAttempts,
          ...(newAttempts >= LOCKOUT_THRESHOLD && { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) }),
        },
      })
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    if (providerUser.failedLoginAttempts > 0 || providerUser.lockedUntil) {
      await prisma.providerUser.update({
        where: { id: providerUser.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    const accessToken = generateProviderAccessToken(providerUser)
    const refreshToken = await generateProviderRefreshToken(providerUser)

    res.json({ providerUser: serializeProviderUser(providerUser), accessToken, refreshToken })
  } catch (error) {
    console.error('Provider login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ─── Register from invitation ────────────────────────────────────────────────
// The invitation token is the proof of ownership — email is taken from the
// invitation, never the request, so it can't be redirected onto another account.
router.post('/register', registerLimiter, validate(registerSchema), async (req, res) => {
  const { token, password, name } = req.body
  try {
    const invitation = await prisma.providerInvitation.findUnique({
      where: { token },
      include: { provider: true },
    })

    if (!invitation || invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invalid or already-used invitation' })
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invitation has expired' })
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const existing = await prisma.providerUser.findUnique({ where: { email: invitation.email.toLowerCase() } })

    let providerUser
    if (existing) {
      // Never reset a set-up account via an invitation link.
      if (existing.passwordHash) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' })
      }
      providerUser = await prisma.providerUser.update({
        where: { id: existing.id },
        data: { passwordHash, ...(name && { name }) },
        include: { provider: true },
      })
    } else {
      providerUser = await prisma.providerUser.create({
        data: {
          providerId: invitation.providerId,
          email: invitation.email.toLowerCase(),
          name: name || invitation.email.split('@')[0],
          passwordHash,
        },
        include: { provider: true },
      })
    }

    await prisma.providerInvitation.update({
      where: { id: invitation.id },
      data: { status: 'REDEEMED', redeemedAt: new Date() },
    })

    const accessToken = generateProviderAccessToken(providerUser)
    const refreshToken = await generateProviderRefreshToken(providerUser)

    res.json({ providerUser: serializeProviderUser(providerUser), accessToken, refreshToken })
  } catch (error) {
    console.error('Provider register error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// ─── Refresh ─────────────────────────────────────────────────────────────────
router.post('/token/refresh', validate(refreshSchema), async (req, res) => {
  try {
    const result = await rotateProviderRefreshToken(req.body.refreshToken)
    if (!result) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }
    res.json(result)
  } catch (error) {
    console.error('Provider token refresh error:', error)
    res.status(500).json({ error: 'Token refresh failed' })
  }
})

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', validate(refreshSchema), async (req, res) => {
  try {
    await revokeProviderRefreshToken(req.body.refreshToken)
    res.json({ message: 'Logged out' })
  } catch (error) {
    console.error('Provider logout error:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
})

// ─── Current provider user ───────────────────────────────────────────────────
router.get('/me', requireProvider, async (req, res) => {
  try {
    const providerUser = await prisma.providerUser.findUnique({
      where: { id: req.providerUser!.id },
      include: { provider: true },
    })
    if (!providerUser) {
      return res.status(404).json({ error: 'Provider user not found' })
    }
    res.json({ providerUser: serializeProviderUser(providerUser) })
  } catch (error) {
    console.error('Provider /me error:', error)
    res.status(500).json({ error: 'Failed to load provider user' })
  }
})

export default router
