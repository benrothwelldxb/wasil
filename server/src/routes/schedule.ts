import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get schedule items
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []
    const { startDate, endDate } = req.query

    const scheduleItems = await prisma.scheduleItem.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
        ],
        AND: [
          {
            OR: [
              { isRecurring: true, active: true },
              {
                isRecurring: false,
                date: {
                  gte: startDate ? new Date(startDate as string) : undefined,
                  lte: endDate ? new Date(endDate as string) : undefined,
                },
              },
            ],
          },
        ],
      },
      orderBy: [{ isRecurring: 'desc' }, { dayOfWeek: 'asc' }, { date: 'asc' }],
    })

    res.json(scheduleItems.map(item => ({
      id: item.id,
      targetClass: item.targetClass,
      classId: item.classId,
      schoolId: item.schoolId,
      isRecurring: item.isRecurring,
      dayOfWeek: item.dayOfWeek,
      active: item.active,
      date: item.date?.toISOString().split('T')[0] || null,
      type: item.type,
      label: item.label,
      description: item.description,
      icon: item.icon,
      createdAt: item.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching schedule:', error)
    res.status(500).json({ error: 'Failed to fetch schedule' })
  }
})

// Get all schedule items (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const scheduleItems = await prisma.scheduleItem.findMany({
      where: { schoolId: user.schoolId },
      orderBy: [{ isRecurring: 'desc' }, { dayOfWeek: 'asc' }, { date: 'asc' }],
    })

    res.json(scheduleItems.map(item => ({
      id: item.id,
      targetClass: item.targetClass,
      classId: item.classId,
      schoolId: item.schoolId,
      isRecurring: item.isRecurring,
      dayOfWeek: item.dayOfWeek,
      active: item.active,
      date: item.date?.toISOString().split('T')[0] || null,
      type: item.type,
      label: item.label,
      description: item.description,
      icon: item.icon,
      createdAt: item.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all schedule items:', error)
    res.status(500).json({ error: 'Failed to fetch schedule' })
  }
})

// Create schedule item (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { targetClass, classId, isRecurring, dayOfWeek, date, type, label, description, icon } = req.body

    const scheduleItem = await prisma.scheduleItem.create({
      data: {
        targetClass,
        classId: classId || null,
        schoolId: user.schoolId,
        isRecurring: isRecurring || false,
        dayOfWeek: dayOfWeek ?? null,
        active: true,
        date: date ? new Date(date) : null,
        type,
        label,
        description: description || null,
        icon: icon || null,
      },
    })

    res.status(201).json({
      id: scheduleItem.id,
      targetClass: scheduleItem.targetClass,
      classId: scheduleItem.classId,
      schoolId: scheduleItem.schoolId,
      isRecurring: scheduleItem.isRecurring,
      dayOfWeek: scheduleItem.dayOfWeek,
      active: scheduleItem.active,
      date: scheduleItem.date?.toISOString().split('T')[0] || null,
      type: scheduleItem.type,
      label: scheduleItem.label,
      description: scheduleItem.description,
      icon: scheduleItem.icon,
      createdAt: scheduleItem.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating schedule item:', error)
    res.status(500).json({ error: 'Failed to create schedule item' })
  }
})

// Update schedule item (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { targetClass, classId, isRecurring, dayOfWeek, active, date, type, label, description, icon } = req.body

    const scheduleItem = await prisma.scheduleItem.update({
      where: { id },
      data: {
        targetClass,
        classId: classId || null,
        isRecurring,
        dayOfWeek: dayOfWeek ?? null,
        active,
        date: date ? new Date(date) : null,
        type,
        label,
        description: description || null,
        icon: icon || null,
      },
    })

    res.json({
      id: scheduleItem.id,
      targetClass: scheduleItem.targetClass,
      classId: scheduleItem.classId,
      schoolId: scheduleItem.schoolId,
      isRecurring: scheduleItem.isRecurring,
      dayOfWeek: scheduleItem.dayOfWeek,
      active: scheduleItem.active,
      date: scheduleItem.date?.toISOString().split('T')[0] || null,
      type: scheduleItem.type,
      label: scheduleItem.label,
      description: scheduleItem.description,
      icon: scheduleItem.icon,
      createdAt: scheduleItem.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating schedule item:', error)
    res.status(500).json({ error: 'Failed to update schedule item' })
  }
})

// Delete schedule item (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.scheduleItem.delete({
      where: { id },
    })

    res.json({ message: 'Schedule item deleted successfully' })
  } catch (error) {
    console.error('Error deleting schedule item:', error)
    res.status(500).json({ error: 'Failed to delete schedule item' })
  }
})

export default router
