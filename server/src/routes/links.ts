import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get active links (for parents)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const links = await prisma.externalLink.findMany({
      where: {
        schoolId: user.schoolId,
        active: true,
      },
      orderBy: { order: 'asc' },
    })

    res.json(links.map(link => ({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      order: link.order,
    })))
  } catch (error) {
    console.error('Error fetching links:', error)
    res.status(500).json({ error: 'Failed to fetch links' })
  }
})

// Get all links (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const links = await prisma.externalLink.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { order: 'asc' },
    })

    res.json(links.map(link => ({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      order: link.order,
      active: link.active,
      createdAt: link.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all links:', error)
    res.status(500).json({ error: 'Failed to fetch links' })
  }
})

// Create link (admin)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, url, icon, order } = req.body

    const link = await prisma.externalLink.create({
      data: {
        title,
        description: description || null,
        url,
        icon: icon || null,
        order: order ?? 0,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      order: link.order,
      active: link.active,
      createdAt: link.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating link:', error)
    res.status(500).json({ error: 'Failed to create link' })
  }
})

// Update link (admin)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { title, description, url, icon, order, active } = req.body

    // Verify link belongs to user's school
    const existing = await prisma.externalLink.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Link not found' })
    }

    const link = await prisma.externalLink.update({
      where: { id },
      data: {
        title,
        description: description || null,
        url,
        icon: icon || null,
        order: order ?? existing.order,
        active: active ?? existing.active,
      },
    })

    res.json({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      order: link.order,
      active: link.active,
      createdAt: link.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating link:', error)
    res.status(500).json({ error: 'Failed to update link' })
  }
})

// Delete link (admin)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify link belongs to user's school
    const existing = await prisma.externalLink.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Link not found' })
    }

    await prisma.externalLink.delete({
      where: { id },
    })

    res.json({ message: 'Link deleted successfully' })
  } catch (error) {
    console.error('Error deleting link:', error)
    res.status(500).json({ error: 'Failed to delete link' })
  }
})

export default router
