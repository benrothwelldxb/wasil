import { Router, Request, Response } from 'express'
import passport from 'passport'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import QRCode from 'qrcode'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { generateAccessToken, generateRefreshToken, revokeRefreshToken, rotateRefreshToken } from '../services/jwt.js'
import { sendMagicLinkEmail, sendInvitationEmail } from '../services/email.js'
import { serializeUser } from '../services/serializers.js'
import {
  generateSecret as generateTotpSecret,
  verifyToken as verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  encryptSecret,
  decryptSecret,
} from '../services/totp.js'

// --- Zod schemas for input validation ---
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const PASSWORD_ERROR = 'Password must be at least 8 characters with uppercase, lowercase, and a number'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const registerSchema = z.object({
  invitationId: z.string().uuid().optional(),
  accessCode: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8).regex(PASSWORD_REGEX, PASSWORD_ERROR),
  name: z.string().optional(),
})

const setPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(PASSWORD_REGEX, PASSWORD_ERROR),
  adminSecret: z.string().optional(),
  name: z.string().optional(),
  schoolName: z.string().optional(),
  role: z.string().optional(),
})

const magicLinkRequestSchema = z.object({
  email: z.string().email(),
})

const exchangeCodeSchema = z.object({
  code: z.string().min(1),
})

const twoFactorVerifySchema = z.object({
  sessionToken: z.string().min(1),
  code: z.string().length(6),
})

const twoFactorRecoverSchema = z.object({
  sessionToken: z.string().min(1),
  code: z.string().min(1),
})

const twoFactorConfirmSchema = z.object({
  code: z.string().length(6),
})

const twoFactorDisableSchema = z.object({
  code: z.string().length(6),
})

const SALT_ROUNDS = 12
const LOCKOUT_THRESHOLD = 10
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

const router = Router()

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'
const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || process.env.ADMIN_URL || 'http://localhost:3001'
const MAGIC_LINK_EXPIRY_MINUTES = 15

// --- Temporary auth code store for OAuth redirects ---
const authCodeStore = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>()

function generateAuthCode(accessToken: string, refreshToken: string): string {
  const code = crypto.randomBytes(32).toString('hex')
  authCodeStore.set(code, {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60 * 1000, // 60 seconds TTL
  })
  return code
}

function exchangeAuthCode(code: string): { accessToken: string; refreshToken: string } | null {
  const entry = authCodeStore.get(code)
  if (!entry) return null
  authCodeStore.delete(code)
  if (Date.now() > entry.expiresAt) return null
  return { accessToken: entry.accessToken, refreshToken: entry.refreshToken }
}

// --- OAuth CSRF state store (with source tracking) ---
const oauthStateStore = new Map<string, { expiresAt: number; source: 'admin' | 'parent' }>()

function generateOAuthState(source: 'admin' | 'parent' = 'parent'): string {
  const state = crypto.randomBytes(32).toString('hex')
  oauthStateStore.set(state, {
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
    source,
  })
  return state
}

function validateOAuthState(state: string | undefined): { valid: boolean; source: 'admin' | 'parent' } {
  if (!state) return { valid: false, source: 'parent' }
  const entry = oauthStateStore.get(state)
  if (!entry) return { valid: false, source: 'parent' }
  oauthStateStore.delete(state)
  if (Date.now() > entry.expiresAt) return { valid: false, source: 'parent' }
  return { valid: true, source: entry.source }
}

// --- 2FA Session Store (pending 2FA verification after password login) ---
const twoFactorSessionStore = new Map<string, { userId: string; expiresAt: number; attempts: number }>()

function createTwoFactorSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  twoFactorSessionStore.set(token, {
    userId,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
    attempts: 0,
  })
  return token
}

function validateTwoFactorSession(token: string): { valid: boolean; userId: string } {
  const entry = twoFactorSessionStore.get(token)
  if (!entry) return { valid: false, userId: '' }
  if (Date.now() > entry.expiresAt) {
    twoFactorSessionStore.delete(token)
    return { valid: false, userId: '' }
  }
  if (entry.attempts >= 5) {
    twoFactorSessionStore.delete(token)
    return { valid: false, userId: '' }
  }
  entry.attempts++
  return { valid: true, userId: entry.userId }
}

// --- 2FA Setup Store (pending secret during setup) ---
const twoFactorSetupStore = new Map<string, { secret: string; recoveryCodes: string[]; hashedCodes: string[]; expiresAt: number }>()

// Clean up expired codes periodically
setInterval(() => {
  const now = Date.now()
  for (const [code, entry] of authCodeStore) {
    if (now > entry.expiresAt) authCodeStore.delete(code)
  }
  for (const [state, entry] of oauthStateStore) {
    if (now > entry.expiresAt) oauthStateStore.delete(state)
  }
  for (const [token, entry] of twoFactorSessionStore) {
    if (now > entry.expiresAt) twoFactorSessionStore.delete(token)
  }
  for (const [userId, entry] of twoFactorSetupStore) {
    if (now > entry.expiresAt) twoFactorSetupStore.delete(userId)
  }
}, 60 * 1000)

// Export the authCodeStore for cleanup from other modules
export { authCodeStore }

// --- Rate limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const emailLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.body?.email?.toLowerCase() || 'unknown',
  message: { error: 'Too many login attempts for this account' },
  standardHeaders: true,
  legacyHeaders: false,
})

const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const setPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const magicLinkVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Get current user
router.get('/me', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        children: {
          include: {
            class: {
              include: {
                assignedStaff: {
                  include: { user: { select: { name: true } } },
                },
              },
            },
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: {
                  include: {
                    assignedStaff: {
                      include: { user: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        school: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Determine if 2FA is required for this user's role
    const twoFactorRequired = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    res.json({
      ...serializeUser(user),
      twoFactorRequired,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Google OAuth
router.get('/google', (req: Request, res: Response, next) => {
  const source = req.query.source === 'admin' ? 'admin' : 'parent'
  const state = generateOAuthState(source as 'admin' | 'parent')
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state,
  })(req, res, next)
})

router.get('/google/callback', (req: Request, res: Response) => {
  const state = req.query.state as string | undefined
  const { valid, source } = validateOAuthState(state)
  const redirectBase = source === 'admin' ? ADMIN_APP_URL : CLIENT_URL

  if (!valid) {
    return res.redirect(`${redirectBase}/login?error=invalid_state`)
  }

  passport.authenticate('google', { session: false }, async (err: Error | null, user: Express.User | false) => {
    if (err || !user) {
      return res.redirect(`${redirectBase}/login?error=auth_failed`)
    }

    try {
      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)
      const code = generateAuthCode(accessToken, refreshToken)
      res.redirect(`${redirectBase}/auth/callback?code=${encodeURIComponent(code)}`)
    } catch {
      res.redirect(`${redirectBase}/login?error=auth_failed`)
    }
  })(req, res)
})

// Microsoft OAuth
router.get('/microsoft', (req: Request, res: Response, next) => {
  const source = req.query.source === 'admin' ? 'admin' : 'parent'
  const state = generateOAuthState(source as 'admin' | 'parent')
  passport.authenticate('azuread-openidconnect', {
    scope: ['profile', 'email', 'openid'],
    session: false,
    state,
  })(req, res, next)
})

router.get('/microsoft/callback', (req: Request, res: Response) => {
  const state = req.query.state as string | undefined
  const { valid, source } = validateOAuthState(state)
  const redirectBase = source === 'admin' ? ADMIN_APP_URL : CLIENT_URL

  if (!valid) {
    return res.redirect(`${redirectBase}/login?error=invalid_state`)
  }

  passport.authenticate('azuread-openidconnect', { session: false }, async (err: Error | null, user: Express.User | false) => {
    if (err || !user) {
      return res.redirect(`${redirectBase}/login?error=auth_failed`)
    }

    try {
      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)
      const code = generateAuthCode(accessToken, refreshToken)
      res.redirect(`${redirectBase}/auth/callback?code=${encodeURIComponent(code)}`)
    } catch {
      res.redirect(`${redirectBase}/login?error=auth_failed`)
    }
  })(req, res)
})

// Exchange auth code for tokens (used by OAuth callback)
router.post('/exchange-code', validate(exchangeCodeSchema), (req, res) => {
  const { code } = req.body

  const tokens = exchangeAuthCode(code)
  if (!tokens) {
    return res.status(401).json({ error: 'Invalid or expired code' })
  }

  res.json(tokens)
})

// Demo login (for development only — requires DEMO_LOGIN_ENABLED env var)
router.post('/demo-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production' || !process.env.DEMO_LOGIN_ENABLED) {
    return res.status(403).json({ error: 'Demo login not available' })
  }

  const { email } = req.body

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        children: { include: { class: true } },
        studentLinks: { include: { student: { include: { class: true } } } },
        school: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user)

    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Demo login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Email/password login (for admin/staff)
router.post('/login', loginLimiter, emailLoginLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        children: { include: { class: true } },
        studentLinks: { include: { student: { include: { class: true } } } },
        school: true,
      },
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      return res.status(423).json({ error: `Account locked. Try again in ${minutesLeft} minutes.` })
    }

    // Check if user has password auth enabled
    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Password login not enabled for this account' })
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      // Increment failed attempts
      const newAttempts = user.failedLoginAttempts + 1
      const updateData: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: newAttempts,
      }
      if (newAttempts >= LOCKOUT_THRESHOLD) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS)
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData })
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Reset failed login attempts on success
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      const sessionToken = createTwoFactorSession(user.id)
      return res.json({ twoFactorRequired: true, twoFactorSessionToken: sessionToken })
    }

    // Update last login
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user)

    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Set password (for admin/staff accounts) - also bootstraps admin if needed
router.post('/set-password', setPasswordLimiter, validate(setPasswordSchema), async (req, res) => {
  const { email, password, adminSecret, name, schoolName, role } = req.body

  // Require admin secret for setting passwords (simple security measure)
  const expectedSecret = process.env.ADMIN_SETUP_SECRET
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return res.status(403).json({ error: 'Invalid admin secret' })
  }

  try {
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    // Bootstrap: create school and admin user if they don't exist
    if (!user) {
      // Only allow bootstrap if no admin exists yet
      const existingAdmin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } })
      if (existingAdmin) {
        return res.status(403).json({ error: 'Admin account already exists. Cannot bootstrap.' })
      }

      // Check if any school exists
      let school = await prisma.school.findFirst()

      if (!school) {
        // Create default school
        school = await prisma.school.create({
          data: {
            name: schoolName || 'My School',
            shortName: schoolName?.substring(0, 10) || 'School',
            city: 'Dubai',
            academicYear: '2025-2026',
            brandColor: '#1e40af',
            accentColor: '#3b82f6',
          },
        })
        console.log('Bootstrap: Created school', school.id)
      }

      // Create admin user (SUPER_ADMIN cannot be created via this endpoint)
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
      const userRole = (role === 'ADMIN' || role === 'STAFF') ? role : 'ADMIN'
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || 'Admin',
          role: userRole,
          schoolId: school.id,
          passwordHash,
        },
      })
      console.log('Bootstrap: Created admin user', user.id, 'with role', userRole)

      return res.json({ message: 'Admin user created successfully', bootstrapped: true })
    }

    // Only allow password setup for admin/staff
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
      return res.status(403).json({ error: 'Password login is only available for staff accounts' })
    }

    // Hash and store password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    // Update user with password and optionally role (SUPER_ADMIN not allowed via this endpoint)
    if (role === 'ADMIN' || role === 'STAFF') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          role: role as 'ADMIN' | 'STAFF',
        },
      })
      return res.json({ message: 'Password set successfully', roleUpdated: true })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    res.json({ message: 'Password set successfully' })
  } catch (error) {
    console.error('Set password error:', error)
    res.status(500).json({ error: 'Failed to set password' })
  }
})

// Register parent with password (from invitation)
router.post('/register', registerLimiter, validate(registerSchema), async (req, res) => {
  const { invitationId, accessCode, email, password, name } = req.body

  if (!invitationId && !accessCode) {
    return res.status(400).json({ error: 'Invitation ID or access code is required' })
  }

  try {
    // Find invitation
    let invitation
    if (invitationId) {
      invitation = await prisma.parentInvitation.findUnique({
        where: { id: invitationId },
        include: {
          school: true,
          childLinks: { include: { class: true } },
          studentLinks: { include: { student: { include: { class: true } } } },
        },
      })
    } else {
      // Normalize code
      const normalizedCode = accessCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const formattedCode = normalizedCode.length === 9
        ? `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3, 6)}-${normalizedCode.slice(6, 9)}`
        : accessCode.toUpperCase()

      invitation = await prisma.parentInvitation.findUnique({
        where: { accessCode: formattedCode },
        include: {
          school: true,
          childLinks: { include: { class: true } },
          studentLinks: { include: { student: { include: { class: true } } } },
        },
      })
    }

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid invitation' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'This invitation has already been used or revoked' })
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (user) {
      return res.status(400).json({ error: 'An account with this email already exists. Please login instead.' })
    }

    // Create user with password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || invitation.parentName || email.split('@')[0],
        role: 'PARENT',
        schoolId: invitation.schoolId,
        passwordHash,
      },
    })

    // Link children (legacy approach)
    for (const link of invitation.childLinks) {
      await prisma.child.create({
        data: {
          name: link.childName,
          parentId: user.id,
          classId: link.classId,
        },
      })
    }

    // Link students (new approach)
    for (const link of invitation.studentLinks) {
      await prisma.parentStudentLink.create({
        data: {
          userId: user.id,
          studentId: link.studentId,
        },
      })
    }

    // Mark invitation as redeemed
    await prisma.parentInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'REDEEMED',
        redeemedAt: new Date(),
        redeemedByUserId: user.id,
        parentEmail: email.toLowerCase(),
      },
    })

    // Fetch full user for response
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        children: { include: { class: true } },
        studentLinks: { include: { student: { include: { class: true } } } },
        school: true,
      },
    })

    if (!fullUser) {
      return res.status(500).json({ error: 'Failed to load user' })
    }

    // Generate tokens
    const accessToken = generateAccessToken(fullUser)
    const refreshToken = await generateRefreshToken(fullUser)

    res.json({
      user: serializeUser(fullUser),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// Request magic link for login (existing users only)
router.post('/magic-link/request', magicLinkLimiter, validate(magicLinkRequestSchema), async (req, res) => {
  const { email } = req.body

  try {
    // Find existing user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { school: true },
    })

    if (!user) {
      // Don't reveal whether user exists - just say email sent
      return res.json({ message: 'If an account exists, a magic link has been sent' })
    }

    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000)

    // Delete any existing tokens for this email
    await prisma.magicLinkToken.deleteMany({
      where: { email: email.toLowerCase(), type: 'LOGIN' },
    })

    // Create new token
    await prisma.magicLinkToken.create({
      data: {
        token,
        email: email.toLowerCase(),
        schoolId: user.schoolId,
        type: 'LOGIN',
        expiresAt,
      },
    })

    // Build magic link URL
    const magicLink = `${PARENT_APP_URL}/auth/magic?token=${token}`

    // Get children names for email
    const children = await prisma.child.findMany({
      where: { parentId: user.id },
      select: { name: true },
    })

    // Send email
    await sendMagicLinkEmail({
      to: email,
      magicLink,
      schoolName: user.school.name,
      childrenNames: children.map(c => c.name),
      isRegistration: false,
    })

    res.json({ message: 'If an account exists, a magic link has been sent' })
  } catch (error) {
    console.error('Magic link request error:', error)
    res.status(500).json({ error: 'Failed to send magic link' })
  }
})

// Verify magic link token and return JWT tokens
router.post('/magic-link/verify', magicLinkVerifyLimiter, async (req, res) => {
  const { token } = req.body

  if (!token) {
    return res.status(400).json({ error: 'Token is required' })
  }

  try {
    // Find the token
    const magicToken = await prisma.magicLinkToken.findUnique({
      where: { token },
    })

    if (!magicToken) {
      return res.status(401).json({ error: 'Invalid or expired link' })
    }

    if (magicToken.usedAt) {
      return res.status(401).json({ error: 'This link has already been used' })
    }

    if (magicToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'This link has expired' })
    }

    // Mark token as used
    await prisma.magicLinkToken.update({
      where: { id: magicToken.id },
      data: { usedAt: new Date() },
    })

    // Handle LOGIN type
    if (magicToken.type === 'LOGIN') {
      const user = await prisma.user.findUnique({
        where: { email: magicToken.email },
        include: {
          children: { include: { class: true } },
          studentLinks: { include: { student: { include: { class: true } } } },
          school: true,
        },
      })

      if (!user) {
        return res.status(401).json({ error: 'User not found' })
      }

      // Check if 2FA is enabled — magic link login also requires 2FA
      if (user.twoFactorEnabled) {
        const sessionToken = createTwoFactorSession(user.id)
        return res.json({ twoFactorRequired: true, twoFactorSessionToken: sessionToken })
      }

      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)

      return res.json({
        user: serializeUser(user),
        accessToken,
        refreshToken,
      })
    }

    // Handle REGISTRATION type
    if (magicToken.type === 'REGISTRATION') {
      if (!magicToken.invitationId) {
        return res.status(400).json({ error: 'Invalid registration token' })
      }

      // Get the invitation
      const invitation = await prisma.parentInvitation.findUnique({
        where: { id: magicToken.invitationId },
        include: {
          school: true,
          childLinks: { include: { class: true } },
          studentLinks: { include: { student: { include: { class: true } } } },
        },
      })

      if (!invitation) {
        return res.status(401).json({ error: 'Invitation not found' })
      }

      if (invitation.status !== 'PENDING') {
        return res.status(401).json({ error: 'This invitation has already been used or revoked' })
      }

      // Create or get user
      let user = await prisma.user.findUnique({
        where: { email: magicToken.email },
      })

      if (!user) {
        // Create new parent user
        user = await prisma.user.create({
          data: {
            email: magicToken.email,
            name: invitation.parentName || magicToken.email.split('@')[0],
            role: 'PARENT',
            schoolId: invitation.schoolId,
          },
        })
      }

      // Create children from invitation (legacy approach - skip if already exists)
      for (const link of invitation.childLinks) {
        const existingChild = await prisma.child.findFirst({
          where: {
            parentId: user.id,
            classId: link.classId,
            name: link.childName,
          },
        })
        if (!existingChild) {
          await prisma.child.create({
            data: {
              name: link.childName,
              parentId: user.id,
              classId: link.classId,
            },
          })
        }
      }

      // Create ParentStudentLink records (new approach)
      for (const link of invitation.studentLinks) {
        const existingLink = await prisma.parentStudentLink.findUnique({
          where: {
            userId_studentId: {
              userId: user.id,
              studentId: link.studentId,
            },
          },
        })
        if (!existingLink) {
          await prisma.parentStudentLink.create({
            data: {
              userId: user.id,
              studentId: link.studentId,
            },
          })
        }
      }

      // Mark invitation as redeemed
      await prisma.parentInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: new Date(),
          redeemedByUserId: user.id,
        },
      })

      // Fetch user with children and studentLinks for response
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          children: { include: { class: true } },
          studentLinks: { include: { student: { include: { class: true } } } },
          school: true,
        },
      })

      if (!fullUser) {
        return res.status(500).json({ error: 'Failed to load user' })
      }

      const accessToken = generateAccessToken(fullUser)
      const refreshToken = await generateRefreshToken(fullUser)

      return res.json({
        user: serializeUser(fullUser),
        accessToken,
        refreshToken,
        isNewUser: true,
      })
    }

    res.status(400).json({ error: 'Invalid token type' })
  } catch (error) {
    console.error('Magic link verify error:', error)
    res.status(500).json({ error: 'Failed to verify magic link' })
  }
})

// Send magic link for registration (from invitation)
router.post('/magic-link/send-registration', async (req, res) => {
  const { invitationId, email } = req.body

  if (!invitationId) {
    return res.status(400).json({ error: 'Invitation ID is required' })
  }

  try {
    let invitation = await prisma.parentInvitation.findUnique({
      where: { id: invitationId },
      include: {
        school: true,
        childLinks: { include: { class: true } },
      },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invitation is not pending' })
    }

    // Use provided email or fall back to invitation email
    const targetEmail = email?.toLowerCase() || invitation.parentEmail

    if (!targetEmail) {
      return res.status(400).json({ error: 'Email address is required' })
    }

    // Update invitation with email if different
    if (email && email.toLowerCase() !== invitation.parentEmail?.toLowerCase()) {
      invitation = await prisma.parentInvitation.update({
        where: { id: invitationId },
        data: { parentEmail: email.toLowerCase() },
        include: {
          school: true,
          childLinks: { include: { class: true } },
        },
      })
    }

    // Generate magic link token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000)

    // Delete any existing registration tokens for this invitation
    await prisma.magicLinkToken.deleteMany({
      where: { invitationId: invitation.id, type: 'REGISTRATION' },
    })

    // Create new token
    await prisma.magicLinkToken.create({
      data: {
        token,
        email: targetEmail,
        schoolId: invitation.schoolId,
        type: 'REGISTRATION',
        invitationId: invitation.id,
        expiresAt,
      },
    })

    // Build magic link URL
    const magicLink = `${PARENT_APP_URL}/auth/magic?token=${token}`

    // Send email
    await sendInvitationEmail({
      to: targetEmail,
      magicLink,
      accessCode: invitation.accessCode,
      schoolName: invitation.school.name,
      childrenNames: invitation.childLinks.map(c => c.childName),
    })

    res.json({ message: 'Registration email sent', email: targetEmail })
  } catch (error) {
    console.error('Send registration magic link error:', error)
    res.status(500).json({ error: 'Failed to send registration email' })
  }
})

// ==========================================
// 2FA Endpoints
// ==========================================

// Setup 2FA — generate secret + QR code + recovery codes
router.post('/2fa/setup', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' })
    }

    const { secret, otpauthUri } = generateTotpSecret(user.email)
    const recoveryCodes = generateRecoveryCodes(8)
    const hashedCodes = await hashRecoveryCodes(recoveryCodes)

    // Store pending setup (10 min TTL)
    twoFactorSetupStore.set(user.id, {
      secret,
      recoveryCodes,
      hashedCodes,
      expiresAt: Date.now() + 10 * 60 * 1000,
    })

    // Generate QR code data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri)

    res.json({
      qrCode: qrCodeDataUrl,
      secret, // manual entry fallback
      recoveryCodes, // show once, user must save
    })
  } catch (error) {
    console.error('2FA setup error:', error)
    res.status(500).json({ error: 'Failed to setup 2FA' })
  }
})

// Confirm 2FA setup — user proves they have the authenticator configured
router.post('/2fa/confirm-setup', isAuthenticated, validate(twoFactorConfirmSchema), async (req, res) => {
  try {
    const userId = req.user!.id
    const { code } = req.body

    const pending = twoFactorSetupStore.get(userId)
    if (!pending || Date.now() > pending.expiresAt) {
      twoFactorSetupStore.delete(userId)
      return res.status(400).json({ error: 'Setup session expired. Please start again.' })
    }

    // Verify the TOTP code
    if (!verifyTotpToken(pending.secret, code)) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' })
    }

    // Save to database
    const encryptedSecret = encryptSecret(pending.secret)
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: JSON.stringify(pending.hashedCodes),
        twoFactorSetupAt: new Date(),
      },
    })

    twoFactorSetupStore.delete(userId)

    res.json({ success: true })
  } catch (error) {
    console.error('2FA confirm setup error:', error)
    res.status(500).json({ error: 'Failed to confirm 2FA setup' })
  }
})

// Verify 2FA code after password login
router.post('/2fa/verify', validate(twoFactorVerifySchema), async (req, res) => {
  const { sessionToken, code } = req.body

  const session = validateTwoFactorSession(sessionToken)
  if (!session.valid) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        children: { include: { class: true } },
        studentLinks: { include: { student: { include: { class: true } } } },
        school: true,
      },
    })

    if (!user || !user.twoFactorSecret) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const secret = decryptSecret(user.twoFactorSecret)
    if (!verifyTotpToken(secret, code)) {
      return res.status(401).json({ error: 'Invalid code' })
    }

    // Success — consume the session token
    twoFactorSessionStore.delete(sessionToken)

    // Update last login
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user)

    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('2FA verify error:', error)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// Use recovery code to login
router.post('/2fa/recover', validate(twoFactorRecoverSchema), async (req, res) => {
  const { sessionToken, code } = req.body

  const session = validateTwoFactorSession(sessionToken)
  if (!session.valid) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        children: { include: { class: true } },
        studentLinks: { include: { student: { include: { class: true } } } },
        school: true,
      },
    })

    if (!user || !user.twoFactorRecoveryCodes) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const hashedCodes: string[] = JSON.parse(user.twoFactorRecoveryCodes)
    const result = await verifyRecoveryCode(code, hashedCodes)

    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid recovery code' })
    }

    // Remove used code
    hashedCodes.splice(result.index, 1)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorRecoveryCodes: JSON.stringify(hashedCodes),
        lastLoginAt: new Date(),
      },
    })

    // Consume the session token
    twoFactorSessionStore.delete(sessionToken)

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user)

    res.json({
      user: serializeUser(user),
      accessToken,
      refreshToken,
      recoveryCodesRemaining: hashedCodes.length,
    })
  } catch (error) {
    console.error('2FA recover error:', error)
    res.status(500).json({ error: 'Recovery failed' })
  }
})

// Disable 2FA (requires current TOTP code)
router.post('/2fa/disable', isAuthenticated, validate(twoFactorDisableSchema), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA is not enabled' })
    }

    const secret = decryptSecret(user.twoFactorSecret)
    if (!verifyTotpToken(secret, req.body.code)) {
      return res.status(401).json({ error: 'Invalid code' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: null,
        twoFactorSetupAt: null,
      },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('2FA disable error:', error)
    res.status(500).json({ error: 'Failed to disable 2FA' })
  }
})

// Get 2FA status
router.get('/2fa/status', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorEnabled: true, twoFactorSetupAt: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })

    res.json({
      enabled: user.twoFactorEnabled,
      setupAt: user.twoFactorSetupAt?.toISOString() || null,
    })
  } catch (error) {
    console.error('2FA status error:', error)
    res.status(500).json({ error: 'Failed to get 2FA status' })
  }
})

// Logout
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await revokeRefreshToken(refreshToken)
  }
  res.json({ message: 'Logged out successfully' })
})

// Token refresh
router.post('/token/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' })
  }

  const result = await rotateRefreshToken(refreshToken)
  if (!result) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' })
  }

  res.json(result)
})

// ==========================================
// Google Calendar OAuth callback
// ==========================================
router.get('/google-calendar/callback', async (req: Request, res: Response) => {
  try {
    const { code, state: schoolId } = req.query

    if (!code || !schoolId || typeof code !== 'string' || typeof schoolId !== 'string') {
      return res.status(400).send('Missing code or school ID')
    }

    const { exchangeGoogleCode } = await import('../services/googleMeet.js')
    const { refreshToken, email } = await exchangeGoogleCode(code)

    await prisma.school.update({
      where: { id: schoolId },
      data: {
        googleCalendarRefreshToken: refreshToken,
        googleCalendarEmail: email,
      },
    })

    // Redirect back to admin with success
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:3001'
    res.redirect(`${adminUrl}/consultations?google_calendar=connected`)
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error)
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:3001'
    res.redirect(`${adminUrl}/consultations?google_calendar=error`)
  }
})

export default router
