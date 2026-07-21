import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, loadUserWithRelations } from '../middleware/auth.js'
import { translateTexts } from '../services/translation.js'
import { sendNotification } from '../services/notify.js'
import { ensureDefaultSubjectReminders } from '../services/subjectReminders.js'
import { subjectKeyOf } from '../services/timetableReminders.js'

const router = Router()

// --- Subject reminder map -------------------------------------------------
// The per-school, admin-editable wording the Hub "Today your child has …"
// helper uses (subject name → emoji + parent-facing nudge). Separate from the
// ScheduleItem grid: the grid drives the manual/fallback schedule; this map
// only supplies wording for Hub-timetabled subjects. Routes are prefixed
// `/reminders` so they never collide with the `/:id` ScheduleItem routes.

// List this school's reminder map (seeding the defaults on first view).
router.get('/reminders', isAuthenticated, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    await ensureDefaultSubjectReminders(schoolId)
    const rows = await prisma.subjectReminder.findMany({
      where: { schoolId },
      orderBy: { subject: 'asc' },
      select: {
        id: true,
        subject: true,
        emoji: true,
        reminder: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    res.json(rows)
  } catch (error) {
    console.error('Error listing subject reminders:', error)
    res.status(500).json({ error: 'Failed to load reminders' })
  }
})

// Create a reminder row.
router.post('/reminders', isAdmin, async (req, res) => {
  try {
    const { subject, emoji, reminder } = req.body ?? {}
    if (typeof subject !== 'string' || !subject.trim()) {
      return res.status(400).json({ error: 'subject is required' })
    }
    if (typeof emoji !== 'string' || !emoji.trim()) {
      return res.status(400).json({ error: 'emoji is required' })
    }
    if (typeof reminder !== 'string' || !reminder.trim()) {
      return res.status(400).json({ error: 'reminder is required' })
    }
    const subjectKey = subjectKeyOf(subject)
    const existing = await prisma.subjectReminder.findUnique({
      where: { schoolId_subjectKey: { schoolId: req.user!.schoolId, subjectKey } },
    })
    if (existing) {
      return res.status(409).json({ error: 'A reminder for that subject already exists' })
    }
    const row = await prisma.subjectReminder.create({
      data: {
        schoolId: req.user!.schoolId,
        subject: subject.trim(),
        subjectKey,
        emoji: emoji.trim(),
        reminder: reminder.trim(),
      },
      select: {
        id: true,
        subject: true,
        emoji: true,
        reminder: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    res.status(201).json(row)
  } catch (error) {
    console.error('Error creating subject reminder:', error)
    res.status(500).json({ error: 'Failed to create reminder' })
  }
})

// Update a reminder row (subject/emoji/reminder/active). Tenant-scoped.
router.put('/reminders/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { subject, emoji, reminder, active } = req.body ?? {}

    const owned = await prisma.subjectReminder.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(404).json({ error: 'Reminder not found' })
    }

    const data: {
      subject?: string
      subjectKey?: string
      emoji?: string
      reminder?: string
      active?: boolean
    } = {}
    if (subject !== undefined) {
      if (typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ error: 'subject must be a non-empty string' })
      }
      const subjectKey = subjectKeyOf(subject)
      // Guard the (schoolId, subjectKey) unique key against another row.
      const clash = await prisma.subjectReminder.findUnique({
        where: { schoolId_subjectKey: { schoolId: req.user!.schoolId, subjectKey } },
      })
      if (clash && clash.id !== id) {
        return res.status(409).json({ error: 'A reminder for that subject already exists' })
      }
      data.subject = subject.trim()
      data.subjectKey = subjectKey
    }
    if (emoji !== undefined) {
      if (typeof emoji !== 'string' || !emoji.trim()) {
        return res.status(400).json({ error: 'emoji must be a non-empty string' })
      }
      data.emoji = emoji.trim()
    }
    if (reminder !== undefined) {
      if (typeof reminder !== 'string' || !reminder.trim()) {
        return res.status(400).json({ error: 'reminder must be a non-empty string' })
      }
      data.reminder = reminder.trim()
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' })
      }
      data.active = active
    }

    const row = await prisma.subjectReminder.update({
      where: { id },
      data,
      select: {
        id: true,
        subject: true,
        emoji: true,
        reminder: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    res.json(row)
  } catch (error) {
    console.error('Error updating subject reminder:', error)
    res.status(500).json({ error: 'Failed to update reminder' })
  }
})

// Delete a reminder row. Tenant-scoped.
router.delete('/reminders/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const result = await prisma.subjectReminder.deleteMany({
      where: { id, schoolId: req.user!.schoolId },
    })
    if (result.count === 0) {
      return res.status(404).json({ error: 'Reminder not found' })
    }
    res.json({ message: 'Reminder deleted successfully' })
  } catch (error) {
    console.error('Error deleting subject reminder:', error)
    res.status(500).json({ error: 'Failed to delete reminder' })
  }
})

// Get schedule items
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    // Get class IDs from both children (legacy) and studentLinks (new)
    const childClassIds = user.children?.map(c => c.classId) || []
    const studentClassIds = (user.studentLinks?.map(l => l.student?.classId).filter((id): id is string => !!id)) || []
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

// Create schedule item (admin only). Pass notifyParents: true in the body
// to push the change to affected class/year-group parents (defaults off so
// staff can draft items without spamming).
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { targetClass, classId, yearGroupId, isRecurring, dayOfWeek, date, type, label, description, icon, notifyParents } = req.body

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

    if (notifyParents) {
      sendNotification({
        req,
        type: 'SCHEDULE_CHANGE',
        title: 'Schedule updated',
        body: `New on the schedule: ${label}`,
        resourceType: 'SCHEDULE',
        resourceId: scheduleItem.id,
        target: { targetClass, classId, yearGroupId, schoolId: user.schoolId },
      }).catch(err => console.error('Failed to send schedule change notification:', err))
    }

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

// Update schedule item (admin only). Same notifyParents flag as POST.
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { targetClass, classId, yearGroupId, isRecurring, dayOfWeek, active, date, type, label, description, icon, notifyParents } = req.body

    // Tenant guard: only update schedule items in the admin's own school.
    const owned = await prisma.scheduleItem.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(404).json({ error: 'Schedule item not found' })
    }

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

    if (notifyParents) {
      sendNotification({
        req,
        type: 'SCHEDULE_CHANGE',
        title: 'Schedule updated',
        body: `Updated on the schedule: ${label}`,
        resourceType: 'SCHEDULE',
        resourceId: scheduleItem.id,
        target: { targetClass, classId, yearGroupId, schoolId: scheduleItem.schoolId },
      }).catch(err => console.error('Failed to send schedule change notification:', err))
    }

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

    // Tenant guard: scoped delete can't remove other schools' schedule items.
    const result = await prisma.scheduleItem.deleteMany({
      where: { id, schoolId: req.user!.schoolId },
    })
    if (result.count === 0) {
      return res.status(404).json({ error: 'Schedule item not found' })
    }

    res.json({ message: 'Schedule item deleted successfully' })
  } catch (error) {
    console.error('Error deleting schedule item:', error)
    res.status(500).json({ error: 'Failed to delete schedule item' })
  }
})

export default router
