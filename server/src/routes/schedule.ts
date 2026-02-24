import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { translateTexts } from '../services/translation.js'

const router = Router()

// Get schedule items
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    // Get class IDs from both children (legacy) and studentLinks (new)
    const childClassIds = user.children?.map(c => c.classId) || []
    const studentClassIds = user.studentLinks?.map(l => l.student?.classId).filter(Boolean) || []
    const allClassIds = [...new Set([...childClassIds, ...studentClassIds])]
    const { startDate, endDate } = req.query

    // Get year group IDs from children's classes
    const childClasses = allClassIds.length > 0
      ? await prisma.class.findMany({
          where: { id: { in: allClassIds } },
          select: { yearGroupId: true },
        })
      : []
    const childYearGroupIds = [...new Set(childClasses.map(c => c.yearGroupId).filter(Boolean))] as string[]

    const scheduleItems = await prisma.scheduleItem.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: allClassIds } },
          ...(childYearGroupIds.length > 0 ? [{ yearGroupId: { in: childYearGroupIds } }] : []),
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

    // Translate if user has non-English language preference
    const targetLang = user.preferredLanguage || 'en'
    const translationMap = new Map<string, string>()

    if (targetLang !== 'en') {
      const textsToTranslate: string[] = []
      scheduleItems.forEach(item => {
        textsToTranslate.push(item.label)
        if (item.description) textsToTranslate.push(item.description)
      })

      const translations = await translateTexts(textsToTranslate, targetLang)

      let translationIndex = 0
      scheduleItems.forEach(item => {
        translationMap.set(item.label, translations[translationIndex++])
        if (item.description) translationMap.set(item.description, translations[translationIndex++])
      })
    }

    const getTranslated = (text: string | null) => text ? (translationMap.get(text) || text) : null

    res.json(scheduleItems.map(item => ({
      id: item.id,
      targetClass: item.targetClass,
      classId: item.classId,
      yearGroupId: item.yearGroupId,
      schoolId: item.schoolId,
      isRecurring: item.isRecurring,
      dayOfWeek: item.dayOfWeek,
      active: item.active,
      date: item.date?.toISOString().split('T')[0] || null,
      type: item.type,
      label: getTranslated(item.label) || item.label,
      description: getTranslated(item.description),
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
      yearGroupId: item.yearGroupId,
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
    const { targetClass, classId, yearGroupId, isRecurring, dayOfWeek, date, type, label, description, icon } = req.body

    const scheduleItem = await prisma.scheduleItem.create({
      data: {
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
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
    const { targetClass, classId, yearGroupId, isRecurring, dayOfWeek, active, date, type, label, description, icon } = req.body

    const scheduleItem = await prisma.scheduleItem.update({
      where: { id },
      data: {
        targetClass,
        classId: classId || null,
        yearGroupId: yearGroupId || null,
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
