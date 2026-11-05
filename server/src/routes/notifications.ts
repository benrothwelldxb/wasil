import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated } from '../middleware/auth.js'
import { parentHiddenMessageWhere } from '../services/partnerSwitch.js'

const router = Router()

/** Leaves out notifications about posts parents cannot see right now: those
 *  of a partner the school has turned off (Wasil Beyond). Usually nothing is
 *  hidden and this adds no condition. */
async function visibleNotificationWhere(schoolId: string) {
  const hidden = await prisma.message.findMany({
    where: { schoolId, ...parentHiddenMessageWhere() },
    select: { id: true },
  })
  if (hidden.length === 0) return {}
  return { OR: [{ resourceId: null }, { resourceId: { notIn: hidden.map(m => m.id) } }] }
}

// List notifications (paginated)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20

    const visible = await visibleNotificationWhere(user.schoolId)
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id, ...visible },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: user.id, ...visible } }),
    ])

    res.json({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        resourceType: n.resourceType,
        resourceId: n.resourceId,
        data: n.data,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Failed to fetch notifications' })
  }
})

// Unread count
router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const count = await prisma.notification.count({
      where: { userId: user.id, read: false, ...(await visibleNotificationWhere(user.schoolId)) },
    })
    res.json({ count })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    res.status(500).json({ error: 'Failed to fetch unread count' })
  }
})

// Mark one as read
router.patch('/:id/read', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const notification = await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    })

    if (notification.count === 0) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({ error: 'Failed to mark notification as read' })
  }
})

// Mark all as read
router.post('/read-all', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})

// Get notification preferences
router.get('/preferences', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    })

    // Return defaults if no preferences set yet
    if (!prefs) {
      return res.json({
        posts: true,
        directMessages: true,
        emergencyAlerts: true,
        forms: true,
        events: true,
        weeklyUpdates: true,
        pulseSurveys: true,
        ecaUpdates: true,
        consultations: true,
        schoolServices: true,
        scheduleReminders: true,
      })
    }

    res.json({
      posts: prefs.posts,
      directMessages: prefs.directMessages,
      emergencyAlerts: prefs.emergencyAlerts,
      forms: prefs.forms,
      events: prefs.events,
      weeklyUpdates: prefs.weeklyUpdates,
      pulseSurveys: prefs.pulseSurveys,
      ecaUpdates: prefs.ecaUpdates,
      consultations: prefs.consultations,
      schoolServices: prefs.schoolServices,
      scheduleReminders: prefs.scheduleReminders,
    })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

// Update notification preferences
router.put('/preferences', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { posts, directMessages, emergencyAlerts, forms, events, weeklyUpdates, pulseSurveys, ecaUpdates, consultations, schoolServices, scheduleReminders } = req.body

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        posts: posts ?? true,
        directMessages: directMessages ?? true,
        emergencyAlerts: emergencyAlerts ?? true,
        forms: forms ?? true,
        events: events ?? true,
        weeklyUpdates: weeklyUpdates ?? true,
        pulseSurveys: pulseSurveys ?? true,
        ecaUpdates: ecaUpdates ?? true,
        consultations: consultations ?? true,
        schoolServices: schoolServices ?? true,
        scheduleReminders: scheduleReminders ?? true,
      },
      update: {
        ...(posts !== undefined && { posts }),
        ...(directMessages !== undefined && { directMessages }),
        ...(emergencyAlerts !== undefined && { emergencyAlerts }),
        ...(forms !== undefined && { forms }),
        ...(events !== undefined && { events }),
        ...(weeklyUpdates !== undefined && { weeklyUpdates }),
        ...(pulseSurveys !== undefined && { pulseSurveys }),
        ...(ecaUpdates !== undefined && { ecaUpdates }),
        ...(consultations !== undefined && { consultations }),
        ...(schoolServices !== undefined && { schoolServices }),
        ...(scheduleReminders !== undefined && { scheduleReminders }),
      },
    })

    res.json({
      posts: prefs.posts,
      directMessages: prefs.directMessages,
      emergencyAlerts: prefs.emergencyAlerts,
      forms: prefs.forms,
      events: prefs.events,
      weeklyUpdates: prefs.weeklyUpdates,
      pulseSurveys: prefs.pulseSurveys,
      ecaUpdates: prefs.ecaUpdates,
      consultations: prefs.consultations,
      schoolServices: prefs.schoolServices,
      scheduleReminders: prefs.scheduleReminders,
    })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

export default router
