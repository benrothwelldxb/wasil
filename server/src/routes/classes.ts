import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all classes
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: 'asc' },
    })

    res.json(classes.map(c => ({
      id: c.id,
      name: c.name,
      colorBg: c.colorBg,
      colorText: c.colorText,
      schoolId: c.schoolId,
    })))
  } catch (error) {
    console.error('Error fetching classes:', error)
    res.status(500).json({ error: 'Failed to fetch classes' })
  }
})

// Create class (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, colorBg, colorText } = req.body

    const newClass = await prisma.class.create({
      data: {
        name,
        colorBg: colorBg || 'bg-blue-500',
        colorText: colorText || 'text-white',
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: newClass.id,
      name: newClass.name,
      colorBg: newClass.colorBg,
      colorText: newClass.colorText,
      schoolId: newClass.schoolId,
    })
  } catch (error) {
    console.error('Error creating class:', error)
    res.status(500).json({ error: 'Failed to create class' })
  }
})

// Update class (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, colorBg, colorText } = req.body

    const updatedClass = await prisma.class.update({
      where: { id },
      data: { name, colorBg, colorText },
    })

    res.json({
      id: updatedClass.id,
      name: updatedClass.name,
      colorBg: updatedClass.colorBg,
      colorText: updatedClass.colorText,
      schoolId: updatedClass.schoolId,
    })
  } catch (error) {
    console.error('Error updating class:', error)
    res.status(500).json({ error: 'Failed to update class' })
  }
})

// Delete class (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Check if class has children
    const childCount = await prisma.child.count({
      where: { classId: id },
    })

    if (childCount > 0) {
      return res.status(400).json({ error: 'Cannot delete class with enrolled children' })
    }

    await prisma.class.delete({
      where: { id },
    })

    res.json({ message: 'Class deleted successfully' })
  } catch (error) {
    console.error('Error deleting class:', error)
    res.status(500).json({ error: 'Failed to delete class' })
  }
})

export default router
