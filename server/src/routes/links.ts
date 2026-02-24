import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get active links grouped by category (for parents)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    // Get categories with their links
    const categories = await prisma.linkCategory.findMany({
      where: { schoolId: user.schoolId },
      include: {
        links: {
          where: { active: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    // Get uncategorized links
    const uncategorizedLinks = await prisma.externalLink.findMany({
      where: {
        schoolId: user.schoolId,
        active: true,
        categoryId: null,
      },
      orderBy: { order: 'asc' },
    })

    const formatLink = (link: any) => ({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      imageUrl: link.imageUrl,
      order: link.order,
    })

    res.json({
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        order: cat.order,
        links: cat.links.map(formatLink),
      })),
      uncategorized: uncategorizedLinks.map(formatLink),
    })
  } catch (error) {
    console.error('Error fetching links:', error)
    res.status(500).json({ error: 'Failed to fetch links' })
  }
})

// Get all links and categories (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const categories = await prisma.linkCategory.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { order: 'asc' },
    })

    const links = await prisma.externalLink.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { order: 'asc' },
    })

    res.json({
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        order: cat.order,
        createdAt: cat.createdAt.toISOString(),
      })),
      links: links.map(link => ({
        id: link.id,
        title: link.title,
        description: link.description,
        url: link.url,
        icon: link.icon,
        imageUrl: link.imageUrl,
        order: link.order,
        active: link.active,
        categoryId: link.categoryId,
        createdAt: link.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching all links:', error)
    res.status(500).json({ error: 'Failed to fetch links' })
  }
})

// Create category (admin)
router.post('/categories', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, order } = req.body

    const category = await prisma.linkCategory.create({
      data: {
        name,
        order: order ?? 0,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: category.id,
      name: category.name,
      order: category.order,
      createdAt: category.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// Update category (admin)
router.put('/categories/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, order } = req.body

    const existing = await prisma.linkCategory.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Category not found' })
    }

    const category = await prisma.linkCategory.update({
      where: { id },
      data: { name, order: order ?? existing.order },
    })

    res.json({
      id: category.id,
      name: category.name,
      order: category.order,
      createdAt: category.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// Delete category (admin)
router.delete('/categories/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.linkCategory.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Category not found' })
    }

    // Links will have categoryId set to null due to onDelete: SetNull
    await prisma.linkCategory.delete({
      where: { id },
    })

    res.json({ message: 'Category deleted successfully' })
  } catch (error) {
    console.error('Error deleting category:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

// Create link (admin)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { title, description, url, icon, imageUrl, order, categoryId } = req.body

    const link = await prisma.externalLink.create({
      data: {
        title,
        description: description || null,
        url,
        icon: icon || null,
        imageUrl: imageUrl || null,
        order: order ?? 0,
        categoryId: categoryId || null,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      imageUrl: link.imageUrl,
      order: link.order,
      active: link.active,
      categoryId: link.categoryId,
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
    const { title, description, url, icon, imageUrl, order, active, categoryId } = req.body

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
        imageUrl: imageUrl !== undefined ? (imageUrl || null) : existing.imageUrl,
        order: order ?? existing.order,
        active: active ?? existing.active,
        categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
      },
    })

    res.json({
      id: link.id,
      title: link.title,
      description: link.description,
      url: link.url,
      icon: link.icon,
      imageUrl: link.imageUrl,
      order: link.order,
      active: link.active,
      categoryId: link.categoryId,
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
