import { Router, Request, Response } from 'express'
import passport from 'passport'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { generateAccessToken, generateRefreshToken, revokeRefreshToken, rotateRefreshToken } from '../services/jwt.js'
import { sendMagicLinkEmail, sendInvitationEmail } from '../services/email.js'

const SALT_ROUNDS = 12

const router = Router()

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'
const PARENT_APP_URL = process.env.PARENT_APP_URL || 'http://localhost:3000'
const MAGIC_LINK_EXPIRY_MINUTES = 15

// Get current user
router.get('/me', isAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        children: {
          include: {
            class: true,
          },
        },
        studentLinks: {
          include: {
            student: {
              include: {
                class: true,
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

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      avatarUrl: user.avatarUrl,
      preferredLanguage: user.preferredLanguage,
      children: user.children.map(child => ({
        id: child.id,
        name: child.name,
        classId: child.classId,
        className: child.class.name,
      })),
      studentLinks: user.studentLinks.map(link => ({
        studentId: link.student.id,
        studentName: `${link.student.firstName} ${link.student.lastName}`,
        className: link.student.class.name,
      })),
      school: {
        id: user.school.id,
        name: user.school.name,
        shortName: user.school.shortName,
        city: user.school.city,
        academicYear: user.school.academicYear,
        brandColor: user.school.brandColor,
        accentColor: user.school.accentColor,
        tagline: user.school.tagline,
        logoUrl: user.school.logoUrl,
        logoIconUrl: user.school.logoIconUrl,
      },
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}))

router.get('/google/callback', (req: Request, res: Response) => {
  passport.authenticate('google', { session: false }, async (err: Error | null, user: Express.User | false) => {
    if (err || !user) {
      return res.redirect(`${CLIENT_URL}/login?error=auth_failed`)
    }

    try {
      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)
      res.redirect(`${CLIENT_URL}/auth/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`)
    } catch {
      res.redirect(`${CLIENT_URL}/login?error=auth_failed`)
    }
  })(req, res)
})

// Microsoft OAuth
router.get('/microsoft', passport.authenticate('azuread-openidconnect', {
  scope: ['profile', 'email', 'openid'],
  session: false,
}))

router.get('/microsoft/callback', (req: Request, res: Response) => {
  passport.authenticate('azuread-openidconnect', { session: false }, async (err: Error | null, user: Express.User | false) => {
    if (err || !user) {
      return res.redirect(`${CLIENT_URL}/login?error=auth_failed`)
    }

    try {
      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)
      res.redirect(`${CLIENT_URL}/auth/callback?token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`)
    } catch {
      res.redirect(`${CLIENT_URL}/login?error=auth_failed`)
    }
  })(req, res)
})

// Demo login (for development only)
router.post('/demo-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Demo login not available in production' })
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        avatarUrl: user.avatarUrl,
        preferredLanguage: user.preferredLanguage,
        children: user.children.map(child => ({
          id: child.id,
          name: child.name,
          classId: child.classId,
          className: child.class.name,
        })),
        studentLinks: user.studentLinks.map(link => ({
          studentId: link.student.id,
          studentName: `${link.student.firstName} ${link.student.lastName}`,
          className: link.student.class.name,
        })),
        school: {
          id: user.school.id,
          name: user.school.name,
          shortName: user.school.shortName,
          city: user.school.city,
          academicYear: user.school.academicYear,
          brandColor: user.school.brandColor,
          accentColor: user.school.accentColor,
          tagline: user.school.tagline,
          logoUrl: user.school.logoUrl,
          logoIconUrl: user.school.logoIconUrl,
        },
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Demo login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Email/password login (for admin/staff)
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

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

    // Check if user has password auth enabled
    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Password login not enabled for this account' })
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Only allow admin/staff to use password login
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
      return res.status(403).json({ error: 'Password login is only available for staff accounts' })
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = await generateRefreshToken(user)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        avatarUrl: user.avatarUrl,
        preferredLanguage: user.preferredLanguage,
        children: user.children.map(child => ({
          id: child.id,
          name: child.name,
          classId: child.classId,
          className: child.class.name,
        })),
        studentLinks: user.studentLinks.map(link => ({
          studentId: link.student.id,
          studentName: `${link.student.firstName} ${link.student.lastName}`,
          className: link.student.class.name,
        })),
        school: {
          id: user.school.id,
          name: user.school.name,
          shortName: user.school.shortName,
          city: user.school.city,
          academicYear: user.school.academicYear,
          brandColor: user.school.brandColor,
          accentColor: user.school.accentColor,
          tagline: user.school.tagline,
          logoUrl: user.school.logoUrl,
          logoIconUrl: user.school.logoIconUrl,
        },
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Set password (for admin/staff accounts) - also bootstraps admin if needed
router.post('/set-password', async (req, res) => {
  const { email, password, adminSecret, name, schoolName, role } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

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
      // Check if any school exists
      let school = await prisma.school.findFirst()

      if (!school) {
        // Create default school
        school = await prisma.school.create({
          data: {
            name: schoolName || 'My School',
            shortName: schoolName?.substring(0, 10) || 'School',
            city: 'City',
            academicYear: '2025-2026',
            brandColor: '#1e40af',
            accentColor: '#3b82f6',
          },
        })
        console.log('Bootstrap: Created school', school.id)
      }

      // Create admin user
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
      const userRole = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'
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

    // Update user with password and optionally role
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          role: role as 'SUPER_ADMIN' | 'ADMIN' | 'STAFF',
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

// Request magic link for login (existing users only)
router.post('/magic-link/request', async (req, res) => {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

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
router.post('/magic-link/verify', async (req, res) => {
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

      const accessToken = generateAccessToken(user)
      const refreshToken = await generateRefreshToken(user)

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          schoolId: user.schoolId,
          avatarUrl: user.avatarUrl,
          preferredLanguage: user.preferredLanguage,
          children: user.children.map(child => ({
            id: child.id,
            name: child.name,
            classId: child.classId,
            className: child.class.name,
          })),
          studentLinks: user.studentLinks.map(link => ({
            studentId: link.student.id,
            studentName: `${link.student.firstName} ${link.student.lastName}`,
            className: link.student.class.name,
          })),
          school: {
            id: user.school.id,
            name: user.school.name,
            shortName: user.school.shortName,
            city: user.school.city,
            academicYear: user.school.academicYear,
            brandColor: user.school.brandColor,
            accentColor: user.school.accentColor,
            tagline: user.school.tagline,
            logoUrl: user.school.logoUrl,
            logoIconUrl: user.school.logoIconUrl,
          },
        },
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
        user: {
          id: fullUser.id,
          email: fullUser.email,
          name: fullUser.name,
          role: fullUser.role,
          schoolId: fullUser.schoolId,
          avatarUrl: fullUser.avatarUrl,
          preferredLanguage: fullUser.preferredLanguage,
          children: fullUser.children.map(child => ({
            id: child.id,
            name: child.name,
            classId: child.classId,
            className: child.class.name,
          })),
          studentLinks: fullUser.studentLinks.map(link => ({
            studentId: link.student.id,
            studentName: `${link.student.firstName} ${link.student.lastName}`,
            className: link.student.class.name,
          })),
          school: {
            id: fullUser.school.id,
            name: fullUser.school.name,
            shortName: fullUser.school.shortName,
            city: fullUser.school.city,
            academicYear: fullUser.school.academicYear,
            brandColor: fullUser.school.brandColor,
            accentColor: fullUser.school.accentColor,
            tagline: fullUser.school.tagline,
            logoUrl: fullUser.school.logoUrl,
            logoIconUrl: fullUser.school.logoIconUrl,
          },
        },
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

export default router
