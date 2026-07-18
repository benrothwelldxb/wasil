import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import QRCode from 'qrcode'
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
import {
  generateSecret as generateTotpSecret,
  verifyToken as verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  encryptSecret,
  decryptSecret,
} from '../services/totp.js'

const router = Router()

// ─── 2FA in-memory stores (mirrors the staff flow) ───────────────────────────
const twoFactorSessionStore = new Map<string, { providerUserId: string; expiresAt: number; attempts: number }>()
const twoFactorSetupStore = new Map<string, { secret: string; hashedCodes: string[]; expiresAt: number }>()

function createTwoFactorSession(providerUserId: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  twoFactorSessionStore.set(token, { providerUserId, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 })
  return token
}
function validateTwoFactorSession(token: string): { valid: boolean; providerUserId: string } {
  const entry = twoFactorSessionStore.get(token)
  if (!entry || Date.now() > entry.expiresAt || entry.attempts >= 5) {
    if (entry) twoFactorSessionStore.delete(token)
    return { valid: false, providerUserId: '' }
  }
  entry.attempts++
  return { valid: true, providerUserId: entry.providerUserId }
}

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

    // If 2FA is enabled, don't issue tokens yet — hand back a short-lived
    // session the client exchanges for tokens via /2fa/verify.
    if (providerUser.twoFactorEnabled && providerUser.twoFactorSecret) {
      return res.json({ twoFactorRequired: true, twoFactorSessionToken: createTwoFactorSession(providerUser.id) })
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

// ─── 2FA: complete login ─────────────────────────────────────────────────────
const twoFactorVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false })
const verifySchema = z.object({ sessionToken: z.string().min(1), code: z.string().min(1) })

async function issueForSession(providerUserId: string) {
  const providerUser = await prisma.providerUser.findUnique({ where: { id: providerUserId }, include: { provider: true } })
  if (!providerUser) return null
  const accessToken = generateProviderAccessToken(providerUser)
  const refreshToken = await generateProviderRefreshToken(providerUser)
  return { providerUser: serializeProviderUser(providerUser), accessToken, refreshToken }
}

router.post('/2fa/verify', twoFactorVerifyLimiter, validate(verifySchema), async (req, res) => {
  const { sessionToken, code } = req.body
  const session = validateTwoFactorSession(sessionToken)
  if (!session.valid) return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' })
  try {
    const pu = await prisma.providerUser.findUnique({ where: { id: session.providerUserId }, select: { twoFactorSecret: true } })
    if (!pu?.twoFactorSecret || !verifyTotpToken(decryptSecret(pu.twoFactorSecret), code)) {
      return res.status(401).json({ error: 'Invalid code' })
    }
    twoFactorSessionStore.delete(sessionToken)
    const result = await issueForSession(session.providerUserId)
    if (!result) return res.status(401).json({ error: 'Invalid session' })
    res.json(result)
  } catch (error) {
    console.error('Provider 2FA verify error:', error)
    res.status(500).json({ error: 'Verification failed' })
  }
})

router.post('/2fa/recover', twoFactorVerifyLimiter, validate(verifySchema), async (req, res) => {
  const { sessionToken, code } = req.body
  const session = validateTwoFactorSession(sessionToken)
  if (!session.valid) return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' })
  try {
    const pu = await prisma.providerUser.findUnique({ where: { id: session.providerUserId }, select: { twoFactorRecoveryCodes: true } })
    if (!pu?.twoFactorRecoveryCodes) return res.status(401).json({ error: 'Invalid session' })
    const hashedCodes: string[] = JSON.parse(pu.twoFactorRecoveryCodes)
    const result = await verifyRecoveryCode(code, hashedCodes)
    if (!result.valid) return res.status(401).json({ error: 'Invalid recovery code' })
    hashedCodes.splice(result.index, 1)
    await prisma.providerUser.update({ where: { id: session.providerUserId }, data: { twoFactorRecoveryCodes: JSON.stringify(hashedCodes) } })
    twoFactorSessionStore.delete(sessionToken)
    const tokens = await issueForSession(session.providerUserId)
    if (!tokens) return res.status(401).json({ error: 'Invalid session' })
    res.json({ ...tokens, recoveryCodesRemaining: hashedCodes.length })
  } catch (error) {
    console.error('Provider 2FA recover error:', error)
    res.status(500).json({ error: 'Recovery failed' })
  }
})

// ─── 2FA: management (authenticated) ─────────────────────────────────────────
router.get('/2fa/status', requireProvider, async (req, res) => {
  const pu = await prisma.providerUser.findUnique({ where: { id: req.providerUser!.id }, select: { twoFactorEnabled: true, twoFactorSetupAt: true } })
  if (!pu) return res.status(404).json({ error: 'Not found' })
  res.json({ enabled: pu.twoFactorEnabled, setupAt: pu.twoFactorSetupAt?.toISOString() || null })
})

router.post('/2fa/setup', requireProvider, async (req, res) => {
  try {
    const pu = await prisma.providerUser.findUnique({ where: { id: req.providerUser!.id }, select: { email: true, twoFactorEnabled: true } })
    if (!pu) return res.status(404).json({ error: 'Not found' })
    if (pu.twoFactorEnabled) return res.status(400).json({ error: '2FA is already enabled' })

    const { secret, otpauthUri } = generateTotpSecret(pu.email)
    const recoveryCodes = generateRecoveryCodes(8)
    const hashedCodes = await hashRecoveryCodes(recoveryCodes)
    twoFactorSetupStore.set(req.providerUser!.id, { secret, hashedCodes, expiresAt: Date.now() + 10 * 60 * 1000 })

    res.json({ qrCode: await QRCode.toDataURL(otpauthUri), secret, recoveryCodes })
  } catch (error) {
    console.error('Provider 2FA setup error:', error)
    res.status(500).json({ error: 'Failed to set up 2FA' })
  }
})

router.post('/2fa/confirm-setup', requireProvider, validate(z.object({ code: z.string().min(1) })), async (req, res) => {
  try {
    const id = req.providerUser!.id
    const pending = twoFactorSetupStore.get(id)
    if (!pending || Date.now() > pending.expiresAt) {
      twoFactorSetupStore.delete(id)
      return res.status(400).json({ error: 'Setup session expired. Please start again.' })
    }
    if (!verifyTotpToken(pending.secret, req.body.code)) return res.status(400).json({ error: 'Invalid code. Please try again.' })

    await prisma.providerUser.update({
      where: { id },
      data: {
        twoFactorSecret: encryptSecret(pending.secret),
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: JSON.stringify(pending.hashedCodes),
        twoFactorSetupAt: new Date(),
      },
    })
    twoFactorSetupStore.delete(id)
    res.json({ success: true })
  } catch (error) {
    console.error('Provider 2FA confirm error:', error)
    res.status(500).json({ error: 'Failed to confirm 2FA' })
  }
})

router.post('/2fa/disable', requireProvider, validate(z.object({ code: z.string().min(1) })), async (req, res) => {
  try {
    const pu = await prisma.providerUser.findUnique({ where: { id: req.providerUser!.id }, select: { twoFactorEnabled: true, twoFactorSecret: true } })
    if (!pu?.twoFactorEnabled || !pu.twoFactorSecret) return res.status(400).json({ error: '2FA is not enabled' })
    if (!verifyTotpToken(decryptSecret(pu.twoFactorSecret), req.body.code)) return res.status(401).json({ error: 'Invalid code' })

    await prisma.providerUser.update({
      where: { id: req.providerUser!.id },
      data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorRecoveryCodes: null, twoFactorSetupAt: null },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Provider 2FA disable error:', error)
    res.status(500).json({ error: 'Failed to disable 2FA' })
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
