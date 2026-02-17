import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'

const router = Router()

// Register/upsert device token
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { token, platform } = req.body

    if (!token || !platform) {
      return res.status(400).json({ error: 'token and platform are required' })
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be ios, android, or web' })
    }

    await prisma.deviceToken.upsert({
      where: { userId_token: { userId: user.id, token } },
      create: { userId: user.id, token, platform },
      update: { platform },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error registering device token:', error)
    res.status(500).json({ error: 'Failed to register device token' })
  }
})

// Remove device token
router.delete('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ error: 'token is required' })
    }

    await prisma.deviceToken.deleteMany({
      where: { userId: user.id, token },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error removing device token:', error)
    res.status(500).json({ error: 'Failed to remove device token' })
  }
})

export default router
