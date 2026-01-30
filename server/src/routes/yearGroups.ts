import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all year groups (authenticated, ordered by order)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const yearGroups = await prisma.yearGroup.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { classes: true } },
      },
      orderBy: { order: 'asc' },
    })

    res.json(yearGroups.map(yg => ({
      id: yg.id,
      name: yg.name,
      order: yg.order,
      schoolId: yg.schoolId,
      classCount: yg._count.classes,
    })))
  } catch (error) {
    console.error('Error fetching year groups:', error)
    res.status(500).json({ error: 'Failed to fetch year groups' })
  }
})

// Create year group (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, order } = req.body

    const yearGroup = await prisma.yearGroup.create({
      data: {
        name,
        order: order ?? 0,
        schoolId: user.schoolId,
      },
      include: {
        _count: { select: { classes: true } },
      },
    })

    res.status(201).json({
      id: yearGroup.id,
      name: yearGroup.name,
      order: yearGroup.order,
      schoolId: yearGroup.schoolId,
      classCount: yearGroup._count.classes,
    })
  } catch (error) {
    console.error('Error creating year group:', error)
    res.status(500).json({ error: 'Failed to create year group' })
  }
})

// Update year group (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { name, order } = req.body

    const existing = await prisma.yearGroup.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Year group not found' })
    }

    const yearGroup = await prisma.yearGroup.update({
      where: { id },
      data: { name, order },
      include: {
        _count: { select: { classes: true } },
      },
    })

    res.json({
      id: yearGroup.id,
      name: yearGroup.name,
      order: yearGroup.order,
      schoolId: yearGroup.schoolId,
      classCount: yearGroup._count.classes,
    })
  } catch (error) {
    console.error('Error updating year group:', error)
    res.status(500).json({ error: 'Failed to update year group' })
  }
})

// Delete year group (admin only, block if classes assigned)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const existing = await prisma.yearGroup.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Year group not found' })
    }

    const classCount = await prisma.class.count({
      where: { yearGroupId: id },
    })

    if (classCount > 0) {
      return res.status(400).json({ error: 'Cannot delete year group with assigned classes. Remove classes from this year group first.' })
    }

    await prisma.yearGroup.delete({
      where: { id },
    })

    res.json({ message: 'Year group deleted successfully' })
  } catch (error) {
    console.error('Error deleting year group:', error)
    res.status(500).json({ error: 'Failed to delete year group' })
  }
})

export default router
