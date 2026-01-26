import { Router } from 'express'
import passport from 'passport'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'

const router = Router()

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
      children: user.children.map(child => ({
        id: child.id,
        name: child.name,
        classId: child.classId,
        className: child.class.name,
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
}))

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=auth_failed',
    successRedirect: '/',
  })
)

// Microsoft OAuth
router.get('/microsoft', passport.authenticate('azuread-openidconnect', {
  scope: ['profile', 'email', 'openid'],
}))

router.get('/microsoft/callback',
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/login?error=auth_failed',
    successRedirect: '/',
  })
)

// Demo login (for development only)
router.post('/demo-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Demo login not available in production' })
  }

  const { email, role } = req.body

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        children: { include: { class: true } },
        school: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Log in the user
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' })
      }
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
        avatarUrl: user.avatarUrl,
        children: user.children.map(child => ({
          id: child.id,
          name: child.name,
          classId: child.classId,
          className: child.class.name,
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
    })
  } catch (error) {
    console.error('Demo login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' })
    }
    res.json({ message: 'Logged out successfully' })
  })
})

export default router
